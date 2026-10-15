const db=require('../db')
const {requireAuth}=require('../services/auth')
const service=require('../services/stream-overview')
module.exports=async function(app){
  app.addHook('onSend',async(request,reply,payload)=>{reply.header('Cache-Control','private, no-store');return payload})
  app.get('/stream-overview/session',{preHandler:requireAuth},request=>service.session(db,request.user))
  app.get('/stream-overview/:streamId',{preHandler:requireAuth,schema:{params:{type:'object',required:['streamId'],properties:{streamId:{type:'string',format:'uuid'}}}}},request=>db.$transaction(tx=>service.overview(tx,request.user,request.params.streamId),{isolationLevel:'RepeatableRead',timeout:15000}))
  app.post('/stream-overview/requests/:id',{preHandler:requireAuth,config:{rateLimit:{max:60,timeWindow:'1 minute'}},schema:{params:{type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}},body:{type:'object',additionalProperties:false,required:['action','revision'],properties:{action:{enum:['take','answer','classify']},revision:{type:'integer',minimum:0},confirmed:{type:'boolean'},streamId:{type:'string',format:'uuid'},needsReply:{type:'boolean'},kind:{enum:['technical','programme','schedule','feedback','unknown']}}}}},request=>service.mutate(db,request.user,request.params.id,request.body))
}
