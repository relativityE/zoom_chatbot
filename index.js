/* zoom testability issue:
 You cannot authorize the applic . This applic cannot be installed outside of the
 developer's account. Please contact the application developer to get support
 with installing this application
*/

/*
Required External Modules
*/
require ('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const sqlite3 = require('sqlite3').verbose()
const ngrok = require('ngrok')
const path  = require('path')
/*
App Variables
*/

//webhook - push data to provider (they r http requests)
//API - pull data from provider
//let { json_intro, json_echo } = require('./app.json')
const util = require('util')
const { oauth2, client, setting, log, request } = require('@zoomus/chatbot')
const app = express()
const port = process.env.PORT || 5000 //use PORT for chatbot server if available
//sqlite3 database - tables
const DB_PATH = './fives.db'
const TKNDB_PATH = './tokenbot.db'

/*
creates 2 tunnels (http, https) to localhost
bind_tls = true (default)
public HTTPS url for development on local machine
can view http traffic for tunnel here:
http://127.0.0.1:4040/inspect/http
A tunnel is used to ship a foreign protocol across
a network that normally wouldn’t support it.
Automate ngrok via API - curl http://127.0.0.1:4040/api/
*/
//need a scheme to prevent multiple connect execution
// => end up with connection refused till timeout expires
const start_tunnel = async () => {
    try {
      console.log('::::::::ngrok.connect on port: ' + port )
      const tunnel = await ngrok.connect(port)
      console.log('::::::::tunnel url to visit via web browser: ' + tunnel)
      return tunnel
    } catch (err) {
      console.error('::::::::failed to start tunnel, ' + err.message )
    }
  }

//read console input from script to shut tunnel
const end_tunnel = async () => {
  try {
    console.log(':::::::executing end_tunnel()')
    //stop all tunnel connections and kill process
    await ngrok.disconnect()
    await ngrok.kill()
    console.log(':::::::executed end_tunnel()')
  } catch (err) {
    console.error(':::::::failed to disconnect & kill tunnel, ' + err.message )
  }
}


/*
App Configuration e.g. app.set()
*/
app.use(bodyParser.json())
app.locals.requestcount = 0
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
function OpenChatDB( create ){
  let FLAG = sqlite3.OPEN_READWRITE;
  if ( create ) {
    FLAG |= sqlite3.OPEN_CREATE
  }
  let db = new sqlite3.Database(DB_PATH, FLAG, err => {
      if(err) return console.log(`Creating database, ${DB_PATH}, failed: ${err.message}`)
      if(create){
        console.log('Created ' + DB_PATH + ' database!')
      }
      else
        console.log('Connected to ' + DB_PATH + ' database')
      db.run('CREATE TABLE IF NOT EXISTS chatbot(name TEXT NOT NULL UNIQUE, hand INT NOT NULL)',
      err => {
        if(err) return console.error('failed to create chabot table: ' +err.message)
        console.log('successfully opened chatbot table!')
      })
    })
    return db
}

//open database for access token refresh
function OpenTokenDB( create ){
  let FLAG = sqlite3.OPEN_READWRITE;
  if ( create ) {
    FLAG |= sqlite3.OPEN_CREATE
  }
  const tokendb = new sqlite3.Database(TKNDB_PATH, FLAG, err => {
    if(err) return console.log(`Creating database, ${TKNDB_PATH}, failed: ${err.message}`)
    if( create ){
      console.log('Created ' + TKNDB_PATH + ' database')
    }
    else
      console.log('Connected to ' + TKNDB_PATH + ' database')

      tokendb.run('CREATE TABLE IF NOT EXISTS app_tokens(accesstoken VARCHAR(800) NOT NULL, refreshtoken VARCHAR(800) NOT NULL, expires INT NOT NULL)',
      err => {
        if(err) return console.error('CREATE TABLE IF NOT EXISTS app_tokens: ' +err.message)
        console.log('successfully opened app_tokens table!')
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

//create databases
let db = OpenChatDB(true)
let tokendb = OpenTokenDB(true)


/*
Route Definitions
*/

app.use((req, res, next) => {   //http request counter
   console.log(`request ${req.method} ${req.url}`)
   app.locals.requestcount++
   util.log('request count: ', app.locals.requestcount)
   next() //pass control to next route
 })

//this is strictly a landing page for getting access to chatbot server
app.get('/', async (req, res, next) => {
  console.log('root dir request, / route')
  console.log('web server root exposed: ', path.join(__dirname, 'public'))
  const options = {
    "root": path.join(__dirname, 'public'),
    "dotfiles" : "deny",
    "headers": {
      "x-timestamp" : Date.now(),
      "x-sent": true
    }
  }

  if (req.query.enable === 'on') {
    console.log('req.query (enable): ', req.query.enable)
    //bypasses firewall/NAT, other network restrictions to connect
    //via port 80 or 443 encapsulated using HTTP protocol
    console.log('********executing start_tunnel()')
    const url = await start_tunnel()
    app.locals.url = url
    console.log('*********executed start_tunnel()')
    let msg = ''
    if(url === undefined){
       msg = "<H2>Server launch FAILED</H2>\
       Likely due to too many rapid requests...\
       <H3>Please click link below and wait a couple of minutes</H3>\
       <a href=\"http://localhost:5000\">Home</a>"
    }
    else{
       msg = "<H2>Click below to launch FIVES chatbot</H2><a href=" + url +
      ">Chatbot Server</a>"
    }
    res.send(msg)
    console.log('*********url update sent to browser client: ', url)
  }
  else {
    console.log('req.query (enable (not on)): ', req.query)
    console.log('app.locals.url: ', app.locals.url)
    console.log('app.locals.whatever: ', app.locals.whatever)
    console.log('app.locals: ')
    console.dir(app.locals)
    if( app.locals.url === undefined ){
      const result = await end_tunnel()
      console.log("disconnected and killed ngrok server")

      const filename = 'index.html'
      res.sendFile(filename, options, err => {
        if(err){
          console.error('sendFile failed: ' + err.message)
          next(err)
        } else {
          console.log('File: ' + filename + ' sent!')
        }
    })
    }
    else {
      res.send('<H1>Successfully launched FIVES!</H1>\
      <H3>You\'re all done, head to zoom chat</H3>')
  }
}
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
      //check time expiration before sql updated
      //used trick from article I read online to set initial expire value to 1 so update happens always
      let current_expiration = 0
      tokendb.serialize(() => {
        tokendb = OpenTokenDB(false);
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
      //check if new user first: use select * from table where name=payload.userName
      //row is undefined if result is empty, sql insert command, else sql update command
      db.serialize( () => {
        db = OpenChatDB(false);
        db.all('SELECT name FROM chatbot WHERE name=?', [payload.userName],
                 (err, rows) => {
          console.log(`perform SELECT operation on user: ${payload.userName}`)
          if(err) return console.log(`SELECT name FROM chatbot, err: ${err.message}`)
          console.log('SELECT name FROM chatbot  row(s): ')
          console.dir(rows)

          if(rows !== undefined && rows.length > 0) { //sanity check, this should be fine if it got here
            new_user = false
            console.log('new_user status updated in SELECT operation, ', new_user)
            console.log('user already in database, ', rows[0].name)

            db = OpenChatDB(false);
            db.all('SELECT COUNT(*) FROM chatbot', [], (err, rows) => {
              if(err) return console.error('SELECT COUNT(*) FROM chatbot, err: ' +err.message)
              console.log('total number of entries in chatbot: ')
              console.dir(rows)
            })
          }
        })

        console.log('new_user status before INSERT operation, ', new_user)
        if (new_user) {
          console.log(`new_user: ${new_user}`)
          console.log('new user added to database: ' + payload.userName)
          db = OpenChatDB(false);
          db.run('INSERT INTO chatbot VALUES (?,?)',
                  [payload.userName, parseInt(payload.actionItem.value)],
                err => {
                  console.log('perform INSERT operation')
                  if(err.message.includes('UNIQUE constraint') ){
                    db = OpenChatDB(false);
                    //existing user:  UNIQUE constraint, attempt update
                    db.run('UPDATE chatbot SET hand=? WHERE name=?',
                          [parseInt(payload.actionItem.value), payload.userName],
                          err => {
                            console.log('perform UPDATE operation')

                            if(err)
                              return console.error('UPDATE chatbot, err: ' +err.message)
                          })
                  }
                  else // any other error
                    return console.error('INSERT INTO chatbot, err: ' +err.message)
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

/*
Server Activation
*/
app.listen(port, () => {
  console.log('================================================================')
  util.log(`fives chatbot started, listening on port: ${port}`)
  console.log("\n''''''''''''''''''''''''''")
  console.log("'''''USER ATTENTION'''''''")
  console.log("''''''''''''''''''''''''''\n")
  console.log("Please launch your browser with the following url to continue")
  console.log("\n=========>>>>    http://localhost:5000\n")
  console.log('================================================================')
})
