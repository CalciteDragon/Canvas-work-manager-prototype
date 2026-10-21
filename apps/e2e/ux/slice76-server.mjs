// Slice76-only forward proxy: physical listeners are4253/4353; virtual browser origins retain host CORS semantics.
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root=process.argv[2];
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost:4253');
  if(url.port==='4310' || url.port==='4353'){
    const upstream=request({hostname:'127.0.0.1',port:4353,path:url.pathname+url.search,method:req.method,headers:{...req.headers,host:'127.0.0.1:4353'}},answer=>{res.writeHead(answer.statusCode??500,answer.headers);answer.pipe(res);});
    upstream.on('error',error=>{res.writeHead(502);res.end(String(error));});req.pipe(upstream);return;
  }
  let file=join(root,normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/,''));
  try{if(!(await stat(file)).isFile())throw 0;}catch{file=join(root,'index.html');}
  try{res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream'});res.end(await readFile(file));}catch(error){res.writeHead(500);res.end(String(error));}
}).on('connect',(req,client,head)=>{
  const target=new URL('http://'+req.url);
  if(!['localhost','127.0.0.1'].includes(target.hostname)||!['4200','4253','4310','4353'].includes(target.port)){client.destroy();return;}
  const hostTarget=['4310','4353'].includes(target.port);
  const upstream=connect(hostTarget?4353:4253,hostTarget?'127.0.0.1':'localhost',()=>{
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);
  });
  upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());
}).listen(4253,'localhost',()=>console.log('Slice76 isolated proxy4253 ->host4353'));
