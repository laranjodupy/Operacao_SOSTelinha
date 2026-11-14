import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const w=JSON.parse(readFileSync('integrations/n8n/tray-balcao-ia.json','utf8'))
assert.equal(w.active,false)
const names=new Set(w.nodes.map(n=>n.name))
for(const entry of Object.values(w.connections))for(const branch of entry.main)for(const c of branch)assert.ok(names.has(c.node))
const prepare=new Function('$json',w.nodes.find(n=>n.name==='Preparar modelo').parameters.jsCode)
const parse=new Function('$json',w.nodes.find(n=>n.name==='Interpretar JSON').parameters.jsCode)
const suggested=prepare({body:{task:'suggest',input:{text:'Quero um caderno'},catalog:[]}})
assert.equal(suggested[0].json.model,'@cf/meta/llama-3.1-8b-instruct')
const image=prepare({body:{task:'extract_product',input:{text:'',image:{mimeType:'image/png',dataBase64:'AAAA'}}}})
assert.equal(image[0].json.aiRequest.image,'data:image/png;base64,AAAA')
assert.deepEqual(parse({result:{response:'```json\n{"items":[],"reply":"Confira."}\n```'}})[0].json,{items:[],reply:'Confira.'})
console.log('OK: JSON do workflow, conexões e transformação de texto/imagem. Importação e execução real no n8n ainda precisam ser validadas.')
