// Explicit owner instruction: attach supplied private values to the confirmed first discussion.
const fs=require('node:fs'),assert=require('node:assert/strict');const stage=__dirname,base='/var/www/telo-pomnit/backend';
require(base+'/node_modules/dotenv').config({path:base+'/.env',quiet:true});const {PrismaClient}=require(base+'/node_modules/@prisma/client'),db=new PrismaClient();
(async()=>{
 const config=JSON.parse(fs.readFileSync(stage+'/recording-private.json'));const parsed=new URL(config.recordingUrl);assert.equal(parsed.protocol,'https:');assert(!parsed.username&&!parsed.password);assert.equal(parsed.hostname,'us06web.zoom.us');assert.equal(typeof config.recordingPasscode,'string');assert(config.recordingPasscode.length>0);
 const backup=JSON.parse(fs.readFileSync(stage+'/backup-receipt.json')).backup;assert(backup.startsWith('/root/telo-backups/meeting-JAPP144-'));
 const result=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM meetings WHERE id=${config.meetingId} FOR UPDATE`;
  const before=await tx.meeting.findUniqueOrThrow({where:{id:config.meetingId}});assert.equal(before.streamId,config.streamId);assert.equal(before.date.toISOString(),config.meetingDate);assert.equal(before.topic,'Психосоматические разборы');assert.equal(before.number,1);
  const same=before.recordingUrl===config.recordingUrl&&before.recordingPasscode===config.recordingPasscode;
  assert(same||(!before.recordingUrl&&!before.recordingPasscode),'Existing recording differs; no overwrite performed');
  const backupFile=backup+'/recording-target-before.json';if(!fs.existsSync(backupFile))fs.writeFileSync(backupFile,JSON.stringify(before),{mode:0o600});
  const after=await tx.meeting.update({where:{id:config.meetingId},data:{recordingUrl:config.recordingUrl,recordingPasscode:config.recordingPasscode}});
  const unchanged=({recordingUrl,recordingPasscode,...rest})=>rest;assert.deepEqual(unchanged(after),unchanged(before));assert.equal(after.recordingUrl,config.recordingUrl);assert.equal(after.recordingPasscode,config.recordingPasscode);
  return {attached:true,meetingDate:'2026-10-15',confirmedFirstDiscussion:true,onlyRecordingFieldsChanged:true,idempotent:same,passcodePreservedExactly:true,privateBeforeSaved:true};
 });
 const access=await require(base+'/src/routes/me').getProgramAccess({id:'no-real-user-verification',telegramId:BigInt(1),role:'HOST',createdAt:new Date()});const stream=access.streams.find(s=>s.id===config.streamId),meeting=stream?.meetings.find(m=>m.id===config.meetingId);assert(stream?.canReadRecordings);assert.equal(meeting.recordingUrl,config.recordingUrl);assert.equal(meeting.recordingPasscode,config.recordingPasscode);
 fs.writeFileSync(stage+'/recording-result.json',JSON.stringify({...result,apiMappingVerified:true,notifications:0,openai:0},null,2));console.log(JSON.stringify({...result,apiMappingVerified:true,notifications:0,openai:0}));
})().catch(e=>{fs.writeFileSync(stage+'/private-recording-error.log',e.stack||String(e),{mode:0o600});console.error('Recording attachment failed; diagnostics private');process.exitCode=1}).finally(()=>db.$disconnect());
