const {
  flowHasToken,
  flowHasClient
} = require('../lib/helpers/context-inspector')
const { createClient, sendRequest } = require('../lib/soap-service')
const tokenGenerator = require('../lib/helpers/token-generator')
const env = require('../config/env')

module.exports = function (RED) {
  function Obito (config) {
    RED.nodes.createNode(this, config)
    const node = this
    this.login = RED.nodes.getNode(config.login)
    this.environment = config.environment
    this.searchType = config.searchType
    const { baseUrl, searchWsdl, authWsdl, clientCtxName, tokenCtxName, environmentCtxName } = env(node.environment)

    node.on('input', async (msg, send, done) => {
      if (!msg.input) {
        msg.input = msg.payload
        msg.payload = {}
      }

      let {
        cpf,
        nome,
        nm_mae,
        dt_nasc: dt_nsct
      } = msg.input
      dt_nsct = dt_nsct ? dt_nsct : "";
      const payload = {
        cpf,
        nome,
        nm_mae,
        dt_nsct
      }
      const searchType = node.searchType
      const flowContext = node.context().flow

      node.status({ fill: 'yellow', shape: 'dot', text: 'requesting' })
      let token
      if (flowHasToken(flowContext, node.environment)) {
        token = flowContext.get(tokenCtxName)
      } else {
        const url = `${baseUrl}${authWsdl}`
        const payload = { username: node.login.username, password: node.login.credentials.password }
        try {
          token = await tokenGenerator(url, payload)
          flowContext.set(tokenCtxName, token)
        } catch (error) {
          node.status({ fill: 'red', shape: 'dot', text: 'error' })
          done('Não foi possivel gerar o token')
          return
        }
      }

      let searchClient
      if (flowHasClient(flowContext, node.environment)) {
        searchClient = flowContext.get(clientCtxName)
      } else {
        const url = `${baseUrl}${searchWsdl}`
        try {
          searchClient = await createClient(url)
          flowContext.set(clientCtxName, searchClient)
        } catch (error) {
          node.status({ fill: 'red', shape: 'dot', text: 'error' })
          done('Não foi possivel gerar o client SOAP')
          return
        }
      }

      flowContext.set(environmentCtxName, node.environment || 'production')

      try {
        const result = await sendRequest(searchClient, token, payload, searchType)
        msg.payload = {
          ...msg.payload,
          obito: {
            result,
            input: payload
          }
        }

        node.status({})
        send(msg)
      } catch (error) {
        node.status({ fill: 'red', shape: 'dot', text: 'error' })
        done('Não foi possível realizar a consulta')
      }
    })
  }

  RED.nodes.registerType('obito', Obito)
}
