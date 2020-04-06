
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

//open database for users & corresponding data
//delete if restarting? design choice
function OpenChatDB(){
  const db = new sqlite3.Database(DB_PATH, err => {
    if(err) {
      return console.log(`Creating database, ${DB_PATH}, failed: ${err.message}`)
    }
      console.log('Connected to ' + DB_PATH + ' database')
      db.run('CREATE TABLE IF NOT EXISTS chatbot(name TEXT NOT NULL UNIQUE, hand INT NOT NULL)',
      err => {
        if(err) {
          return console.error('failed to create chabot table: ' +err.message) }
      console.log('chatbot table created!')
      })
    })
    return db
}


//open database for access token refresh
function OpenTokenDB(){
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
//helper function to setup zoomApp
async function authChatbot (req, res, next) {
    try {
      let { code } = req.query
      console.log('authChatbot code : ', code)
      process.env.auth_code = code
      let connection = await oauth2client.connectByCode(code)
      let zoomApp = chatbot.create({auth : connection})
      app.locals.zoomApp = zoomApp;
      console.log('authChatbot - app.locals.zoomApp: ', app.locals.zoomApp)
      return zoomApp
    } catch (err) {
      return console.log('authChatbot2 failed: ' +err)
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
app.get('/authorize', async (req, res) => {
    let zoomApp = await authChatbot(req, res)
    let tokens = zoomApp.auth.getTokens()
    app.locals.zoomApp = zoomApp
    console.log('/authorize - app.locals.zoomApp: ', app.locals.zoomApp)
    process.env.access_tkn = tokens.access_token
    process.env.refresh_tkn = tokens.refresh_token
    process.env.expires_in = tokens.expires_in

    if(process.env.auth_code != ''){
      //save access_token & refresh_token, expire_time in database
      //modify to check time expiration before sql updated
      //probably use trick to set initial expire value to 1 so update happens always
      //select expires from app_tokens
      //db.get('select * from table')
      let tokendb = OpenTokenDB();
      let current_expiration = 0
      tokendb.serialize(() => {
        tokendb.get('SELECT expires from app_tokens', (err, row) => {
          if(err) {return console.log('error getting token expiration: ', err.message)}
          console.log('token expiration in database: ', row.expires)
          console.log('SELECT app_tokens')
          current_expiration = row.expires
        }) //get expiration
        if(current_expiration <= 0){
          //request new token and update db
          tokendb.run('UPDATE app_tokens SET accesstoken=?, refreshtoken=?, expires=?',
                  [process.env.access_tkn, process.env.refresh_tkn, parseInt(process.env.expires_in)],
                err => {
                  console.log('UPDATE app_tokens')
                  if(err) {
                    return console.error('UPDATE app_tokens: ' +err.message) }
                })
        }
        else {
          console.log('token currently valid, expires in: ', current_expiration)
        }
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
      let new_user = true
      //store user input selection
      //user & hand selected
      //check if new user first: use select * from table where name=payload.userName
      //row is undefined if result is empty, sql insert command, else sql update command
      //'SELECT name FROM chatbot WHERE name=?' //payload.userName,// WHERE name=?
      let db = OpenChatDB();
      db.serialize(() => {
        db.all('SELECT name FROM chatbot WHERE name=?', [payload.userName],
                 (err, rows) => {
          console.log(`perform SELECT operation on user: ${payload.userName}`)
          console.log(`SELECT operation err: `)
          console.dir(err)
          console.log(`SELECT operation row: `)
          console.dir(rows)

          if(err)
            return console.error('SELECT name FROM chatbot: ' +err.message)
          console.log('info retrieved from database, rows[0].name ' + rows[0].name)
          console.log('info retrieved from database, rows: ')
          console.dir(rows)
          if(rows !== undefined) {
            console.log('rows !== undefined')

            if( rows[0].name === payload.userName ){
              console.log('rows.name === payload.userName new_user=false')
              new_user = false
              console.log('user already in database, ', rows.name)
            }
          }
        })

        console.log('new_user status before INSERT operation, ', new_user)
        if (new_user) {
          console.log(`new_user: ${new_user}`)
          console.log('new user added to database: ' + payload.userName)

          db.run('INSERT INTO chatbot(name, hand) VALUES (?,?)',
                  [payload.userName, parseInt(payload.actionItem.value)],
                err => {
                  console.log('perform INSERT operation')

                  if(err)
                    return console.error('INSERT INTO chatbot: ' +err.message)
                })
        }
        else { //existing user
          db.run('UPDATE chatbot SET hand=? WHERE name=?',
                [parseInt(payload.actionItem.value), payload.userName],
                err => {
                  console.log('perform UPDATE operation')

                  if(err)
                    return console.error('INSERT INTO chatbot: ' +err.message)
                })
        }
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
