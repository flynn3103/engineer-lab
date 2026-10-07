// usage: node shot.mjs file.html width out.png selector [dark] [chapterIndex] [click-selector]
import puppeteer from 'puppeteer-core'; import path from 'node:path';
const [file,w,out,sel,scheme,ch,clk]=process.argv.slice(2);
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:+w,height:900,isMobile:+w<600,hasTouch:+w<600});
await p.emulateMediaFeatures([{name:'prefers-color-scheme',value:scheme||'light'}]);
await p.goto('file://'+path.resolve(file)); await new Promise(r=>setTimeout(r,500));
if(ch!==undefined&&ch!=='-') await p.evaluate(k=>jumpPhase(+k,false),ch);
if(clk&&clk!=='-'){await p.evaluate(s=>document.querySelector(s).click(),clk);await new Promise(r=>setTimeout(r,1200));}
await new Promise(r=>setTimeout(r,300));
const el=await p.$(sel); await el.screenshot({path:out}); await b.close();
