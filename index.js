
/*
Required External Modules
*/
require ('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const sqlite3 = require('sqlite3').verbose()
/*
App Variables
// You cannot authorize the applic . This applic cannot be installed outside of the
// developer's account. Please contact the application developer to get support
// with installing this application.
*/

//let { json_intro, json_echo } = require('./app.json')
const util = require('util')
const { oauth2, client, setting, log, request } = require('@zoomus/chatbot')
const app = express()
const port = process.env.PORT || 5000 //use PORT if available
const DB_PATH = './fives.db'
const TKNDB_PATH = './tokenbot.db'

/*
App Configuration e.g. app.set()
*/
app.use(bodyParser.json())
app.locals.requestcount = 0
app.locals.zoomApp = 'undefined'
//setup and configure json_chatbot_to_user
const oauth2client = oauth2( process.env.client_id,
                             process.env.client_secret,
                             process.env.redirect_uri)

const chatbot = client( process.env.client_id,
                        process.env.verification_token,
                        process.env.bot_jid).defaultAuth(oauth2client.connect())
app.locals.chatbot = chatbot
console.log('client - chatbot : ', chatbot)

//create & open database for users & corresponding data
function CreateChatBotDB(){
  const db = new sqlite3.Database(DB_PATH, err => {
    if(err) {
      return console.log(`Creating database, ${DB_PATH}, failed: ${err.message}`)
    }
      console.log('Connected to ' + DB_PATH + ' database')
      db.run('CREATE TABLE IF NOT EXISTS chatbot(name TEXT NOT NULL, hand INT NOT NULL)',
      err => {
        if(err) {
          return console.error('failed to create chabot table: ' +err.message) }
      console.log('chatbot table created!')
      })
    })
    return db
}


//create database for access token refresh
function CreateTokenDB(){
  const tokendb = new sqlite3.Database(TKNDB_PATH, err => {
    if(err) {
      return console.log(`Creating database, ${TKNDB_PATH}, failed: ${err.message}`)
    }
      console.log('Connected to ' + TKNDB_PATH + ' database')
      tokendb.run('CREATE TABLE IF NOT EXISTS app_tokens(accesstoken VARCHAR(800) NOT NULL, refreshtoken VARCHAR(800) NOT NULL, expires INT NOT NULL)',
      err => {
        if(err) {
          return console.error('CREATE TABLE IF NOT EXISTS app_tokens: ' +err.message) }
      console.log('app_tokens table created!')
      })
    })
    return tokendb
}


//1a) install chatbot app
const authChatbot = async (req, res, next) => {
    try {
      let { code } = req.query
      console.log('authChatbot code : ', code)
      process.env.auth_code = code
      let connection = await oauth2client.connectByCode(code)
      let zoomApp = chatbot.create({auth : connection})
      app.locals.zoomApp = zoomApp
      console.log('authChatbot - app.locals.zoomApp: ', app.locals.zoomApp)
      next()
    } catch (err) {
      console.log(err)
      res.send(err)
    }
}

const authChatbot2 = async (req, res, next) => {
    try {
      let { code } = req.query
      console.log('authChatbot code : ', code)
      process.env.auth_code = code
      let connection = await oauth2client.connectByCode(code)
      app.locals.zoomApp = chatbot.create({auth : connection})
      console.log('authChatbot - app.locals.zoomApp: ', app.locals.zoomApp)
      return app.locals.zoomApp
    } catch (err) {
      console.log(err)
      res.send(err)
      return err
    }
}
/*
Route Definitions
*/
app.use('/', (req, res, next) => {
   console.log(`request ${req.method} ${req.url}, originalURL: ${req.originalUrl}`)
   console.log('response object {headersSent}: ', res.headersSent)
   app.locals.requestcount++
   console.log('request count: ', app.locals.requestcount)
   next() //pass control to next route
 })

//1b) oauth 2.0 - zoom prompts to request authorization from user to install chatbot
app.get('/authorize', authChatbot, async (req, res) => {
    let { zoomApp } = app.locals
    let tokens = zoomApp.auth.getTokens()
    console.log('/authorize - zoomApp: ', zoomApp)
    process.env.access_tkn = tokens.access_token
    process.env.refresh_tkn = tokens.refresh_token
    process.env.expires_in = tokens.expires_in

    if(process.env.auth_code != ''){
      //save access_token & refresh_token, expire_time in database
      //modify to check time expiration before sql updated
      //probably use trick to set initial expire value to 1 so update happens always
      //select expires from app_tokens
      //db.get('select * from table')
      let tokendb = CreateTokenDB();
      tokendb.serialize(() => {
        tokendb.run('INSERT INTO app_tokens (accesstoken, refreshtoken, expires) VALUES (?,?,?)',
                [process.env.access_tkn, process.env.refresh_tkn, parseInt(process.env.expires_in)],
              err => {
                if(err) {
                  return console.error('INSERT INTO app_tokens: ' +err.message) }
              })
      })
      tokendb.close( err => {
         if(err) {
           return console.error('failed to close ' + TKNDB_PATH + ' database: ' +err.message) }
       console.log( TKNDB_PATH + ' database closed' )
      })
      console.log('/authorize - process.env.access_tkn: ', process.env.access_tkn)
      console.log('/authorize - process.env.refresh_tkn: ', process.env.refresh_tkn)
      console.log('/authorize - process.env.expires_in: ', process.env.expires_in)
      console.log(`/authorize redirecting..`)
      res.redirect('https://zoom.us/launch/chat?jid=robot_'+process.env.bot_jid)
    }
    else {
      console.log(`Did NOT receive authorization: ${process.env.auth_code}`)
    }
})


//2) get (req object) or send (res object) message to channel or bot
//service slash_command
app.post('/'+ process.env.slash_cmd, async (req, res) => {
  console.log('/fif app.locals: ')
  console.dir(app.locals)
  console.log('/fif body ================================')
  console.dir(req.body)
  console.log('/fif headers =============================')
  console.dir(req.headers)
  console.dir(res.headersSent)

  let { zoomApp } = app.locals
  let { body, headers } = req
  let { event, payload } = body
  let { toJid, userJid, accountId } = payload

  console.log('/fif - toJid : ', toJid)
  console.log('/fif - userJid : ', userJid)
  console.log('/fif - accountId : ', accountId)

  if (toJid === undefined) {
    if(userJid !== undefined){
      toJid = userJid
      console.log(`/fif updated toJid: ${toJid}`)
    }
  }
  switch(event){
    case 'bot_installed':
      console.log(`c:5s chatbot installed for: ${payload.userName}`)
      res.send(`b:5s chatbot installed for: ${payload.userName}`)
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

      //send welcome POST request to user
      let json_intro = {
          "robot_jid" : process.env.bot_jid,
          "to_jid" : toJid,
          "account_id" : accountId,
          "content" : {
            "head" : {
              "text" : "Hi, I'm the Fives chatbot!",
              "sub_head": {
                "text": "Make your selection"
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

      console.log('bot_notification - zoomApp : ', zoomApp)
      //send chatbot echo message to new user
      try {
        if (payload.cmd === 'play'){
          console.log('bot_notification - json_intro: ')
          console.dir(json_intro)
          await zoomApp.sendMessage( json_intro )
        }else {
          console.log('bot_notification - json_echo: ')
          console.dir(json_echo)
          //send chatbot msg to user
          await zoomApp.sendMessage( json_echo )
        }
      } catch (err) {
          console.log('bot_notification - send error: ', err)
      }
      break;
    case 'interactive_message_actions':
      console.log('chatbot UI feedback from user:', body)

      //store user input selection
      //user & hand selected
      //modify below to use select * from table where name=payload.name
      //if return is empty, sql insert command, else sql update command
      let db = CreateChatBotDB();
      db.serialize(() => {
        db.run('INSERT INTO chatbot(name, hand) VALUES (?,?)',
                [payload.userName, parseInt(payload.actionItem.value)],
              err => {
                if(err)
                  return console.error('INSERT INTO chatbot: ' +err.message)
              })
      })
      db.close( err => {
         if(err) {
           return console.error('failed to close ' + DB_PATH + ' database: ' +err.message) }
       console.log( DB_PATH + ' database closed' )
      })
      break;
    default:
      console.log(`unaccounted for event: ${event}`)
  }
})

app.get('/', (req,res) => {
   console.log('/ route {req.body}: ', req.body)
   res.send("welcome aboard fives game, users")
})

/*
Server Activation
*/
app.listen(port, () => {
  console.log('===============================================================')
  util.log(`fives chatbot started, listening on port ${port}!`)
  console.log('===============================================================')
})
