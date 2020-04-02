
require ('dotenv').config()

//let { json_intro, json_echo } = require('./app.json')
const express = require('express');
const bodyParser = require('body-parser');
const util = require('util')
const { oauth2, client, setting, log, request } = require('@zoomus/chatbot')


const app = express()
const port = process.env.PORT || 5000

app.use(bodyParser.json())

//setup and configure json_chatbot_to_user
const oauth2client = oauth2( process.env.client_id,
                             process.env.client_secret,
                             process.env.redirect_uri)

const chatbot = client( process.env.client_id,
                        process.env.verification_token,
                        process.env.bot_jid).defaultAuth(oauth2client.connect())

app.locals.chatbot = chatbot
console.log('client - chatbot : ', chatbot)

//1a) install chatbot app
let authChatbot = async (req, res, next) => {
    let { code } = req.query
    console.log('authChatbot code : ', code)
    process.env.auth_code = code
    try {
      let connection = await oauth2client.connectByCode(code)
      let zoomApp = chatbot.create({auth : connection})
      app.locals.zoomApp = zoomApp
      next()
    } catch (err) {
      console.log(err)
      res.send(err)
    }
}

//routes
//1b) oauth 2.0 - zoom prompts to request authorization from user to install chatbot
app.get('/authorize', authChatbot, (req, res) => {
    let { zoomApp } = app.locals
    let tokens = zoomApp.auth.getTokens()
    console.log('/authorize route {req.body}: ', req.body)

    process.env.access_tkn = tokens.access_token
    if(process.env.auth_code != ''){
      //save access_token & refresh_token, expire_time in database

      //request zoom openAPI to get accountId, Jid info
      //let userinfo = await zoomApp.request({ url : 'https://api.zoom.us/v2/users/me', method : 'get'})
      //console.log("openAPI userinfo: ", userinfo)

      console.log(`/authorize redirecting..`)
      res.redirect('https://zoom.us/launch/chat?jid=robot_'+process.env.bot_jid)
    }
    else
      console.log(`Did NOT receive authorization: ${process.env.auth_code}`)
})


//2) get (req object) or send (res object) message to channel or bot
//service slash_command
app.post('/'+ process.env.slash_cmd, (req, res) => {

  let { zoomApp } = app.locals
  let { body, headers } = req
  let { event, payload } = body
  let { toJid, accountId } = payload

  console.log('/fif req.body: ', body)
  console.log('slash_cmd - toJid : ', toJid)
  console.log('slash_cmd - accountId : ', accountId)

  switch(event){
    case 'bot_installed':
      console.log(`chatbot installed for: ${payload.userName}`)

      let json_intro = {
          "robot_jid" : process.env.bot_jid,
          "to_jid" : toJid,
          "account_id" : accountId,
          "content" : {
            "head" : {
              "text" : "Hi I'm the Fives chatbot!",
              "sub_head": {
                "text": "Play the game?"
              }
            },
            "body" : [{
              "type" : "actions",
              "items" : [{
                "text" : "Five",
                "value" : "5",
                "style" : "Primary"
              },
              {
                "text" : "Zero",
                "value" : "0",
                "style" : "Danger"
              }]
            }]
          }
        }

      let welcome_msg = {
          "head" : {
            "text" : "Hi I'm the Fives chatbot!",
            "sub_head": {
              "text": "Play the game?"
            }
          },
          "body" : [{
            "type" : "actions",
            "items" : [{
              "text" : "Five",
              "value" : "5",
              "style" : "Primary"
            },
            {
              "text" : "Zero",
              "value" : "0",
              "style" : "Danger"
            }]
          }]
        }

        //send chatbot welcome message to new user
        try {
          console.log('body ================================')
          console.dir(body)
          console.log('headers =============================')
          console.dir(headers)
          //await chatbot.handle({ body, headers });
          //chatbot msg to user
          //await zoomApp.sendMessage( welcome_msg )
          res.send(json_intro)
        } catch (err) {
            console.log('chatbot to user send error: ', err)
        }
      break;
    case 'bot_notification':
      console.log(`Message to chatbot from user: ${payload.cmd}`)

      let json_echo = {
        "robot_jid" : process.env.bot_jid,
        "to_jid" : toJid,
        "account_id" : accountId,
        "content" : {
          "head" : {
            "text" : "Fives chatbot!",
            "sub_head": {
              "text": "echo msg"
            }
          },
          "body" : [{
            "type" : "message",
            "text" : payload.name + ', you sent: ' + payload.cmd
          }]
        }
      }

      console.log('bot_notification - chatbot : ', chatbot)

      res.send(json_echo)
      break;
    case 'interactive_message_actions':
      console.log('chatbot UI feedback from user:', body)
      break;
    default:
      console.log(`unaccounted for event: ${event}`)
  }
})

app.get('/', (req,res) => {
   console.log('/ route {req.body}: ', req.body)
   res.send("welcome aboard fives game, users")
})

//start server listening
app.listen(port, () => {
  console.log('===============================================================')
  util.log(`fives chatbot started, listening on port ${port}!`)
  console.log('===============================================================')
})
