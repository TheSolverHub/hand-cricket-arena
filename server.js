const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const WebSocket=require('ws');
const PORT=process.env.PORT||3000,ROOT=__dirname; const ANNOUNCEMENT_FILE=path.join(ROOT,'announcement.json');
let announcement={enabled:false,title:'',message:'',updatedAt:0};

try{
  announcement=Object.assign(
    announcement,
    JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE,'utf8')||'{}')
  );
}catch{}

function saveAnnouncement(){
  try{
    fs.writeFileSync(
      ANNOUNCEMENT_FILE,
      JSON.stringify(announcement,null,2)
    );
  }catch(e){
    console.error('Announcement save error:',e.message);
  }
}
