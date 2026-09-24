'use strict'

//-------------

require('dotenv').config();

//--
const express = require('express');
const bodyParser = require('body-parser')
const app = express();
const crypto = require('crypto');

app.use(bodyParser.json());

//---- CORS policy - Update this section as needed ----

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

//--- Vonage API - SDK instance ---

const { Auth } = require('@vonage/auth');

const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
  privateKey: './.private.key'    // private key file name with a leading dot 
});

const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage(credentials);

//-- Vonage API - A phone number associated to this application (see in dashboard) --

const servicePhoneNumber = process.env.SERVICE_PHONE_NUMBER;
console.log('------------------------------------------------------------');
console.log("You may call in to the phone number:", servicePhoneNumber);
console.log('------------------------------------------------------------');

//-- For tests - Human Agent or Contact Center phone number --
const humanAgentPhoneNumber = process.env.HUMAN_AGENT_PHONE_NUMBER

//-- Vonage API - For optional call leg recording --

const fs = require('fs');
const axios = require('axios');

const appId = process.env.APP_ID; // used by tokenGenerate
const privateKey = fs.readFileSync('./.private.key'); // used by tokenGenerate
const { tokenGenerate } = require('@vonage/jwt');

const apiBaseUrl = process.env.API_BASE_URL;

// let recordCalls = false;
// if (process.env.RECORD_CALLS == 'true') {
//   recordCalls = true
// }

//-------------------

//---- Connector server (middleware) ----
const processorServer = process.env.PROCESSOR_SERVER;

//---- Custom settings ---
const maxCallDuration = process.env.MAX_CALL_DURATION; // in seconds

//-----------------------------------------------------------------------------------

// Tracking related call uuids (customer leg uuid, customer websocket leg uuid, human agent leg uuid, human agent websocket leg uuid)

const session = {};

async function createSession() {      // uuid of customer call leg 
  
  const sessionId = crypto.randomUUID();

  session[sessionId] = {}; 
  session[sessionId]["uuid1"] = null; // party 1 call leg uuid 
  session[sessionId]["ws_uuid1"] = null; // party 1 websocket leg uuid
  session[sessionId]["transfer1"] = false; // allow only 1 LLM transfer request to avoid duplicate legs and loops
  session[sessionId]["number1"] = null; // party 1 phone number
  session[sessionId]["original_convuuid1"] = null; // initial conversation uuid of party 1 call leg
  session[sessionId]["uuid2"] = null; // party 2 call leg uuid 
  session[sessionId]["ws_uuid2"] = null; // party 2 call leg uuid 
  session[sessionId]["transfer2"] = false; // allow only 1 LLM transfer request to avoid duplicate legs and loops

  return sessionId;

}
 
//===================================================================================

console.log('------------------------------------------------------------');
console.log('To manually trigger an outbound PSTN call to a phone number,');
console.log('in a web browser, enter the address:');
console.log('https://<this-application-server-address>/call?number=<number>');
console.log("<number> must in E.164 format without '+' sign, or '-', '.' characters");
console.log('for example');
console.log('https://xxxx.ngrok.xxx/call?number=12995551212');
console.log('------------------------------------------------------------');

//============= Initiating outbound PSTN calls ===============

//-- Use case where the PSTN call is outbound
//-- manually trigger outbound PSTN call to a number
//-- sample request in a web browser: https://<this-server-address>/call?number=12995550101

app.get('/call', async(req, res) => {

  if (req.query.number == null) {

    res.status(200).send('"number" is missing as a query parameter - please check');
  
  } else {

    // code may be added here to make sure the number is in valid E.164 format (without leading '+' sign)
  
    res.status(200).send('Ok');  

    const hostName = req.hostname;
    const calleeNumber = req.query.number;
    const newSessionId = await createSession();
    session[newSessionId]["number1"] = calleeNumber; // party 1 number is the customer, called number in this case of an outbound call

    // WebSocket URI for party 1 (e.g. customer) call leg and necessary parameters
    const wsUri1 = `wss://${processorServer}/socket?participant=customer&call_direction=outbound&session=${newSessionId}&webhook_base_url=https://${hostName}`;

    //-- Outgoing PSTN call to customer --

    vonage.voice.createOutboundCall({
      to: [{
        type: 'phone',
        number: calleeNumber
      }],
      from: {
       type: 'phone',
       number: servicePhoneNumber
      },
      // advanced_machine_detection: {
      //   "behavior": "continue",
      //   "mode": "default",
      //   "beep_timeout": 45
      // },
      ringing_timer: 70,
      // limit: maxCallDuration, // in seconds, limit outbound call duration if needed
      event_url: [`https://${hostName}/event_1?session=${newSessionId}`],
      event_method: 'POST',
      ncco: [
        {
          "action": "connect",
          "eventUrl": [`https://${hostName}/ws_event_1?session=${newSessionId}`],
          "timeout": "45",
          "from": calleeNumber,
          "endpoint": [
            {
              "type": "websocket",
              "uri": wsUri1,
              "content-type": "audio/l16;rate=16000"  // NEVER change the content-type parameter argument
            }
          ]

        }
      ]
      })
    .then(res => {
      session[newSessionId]["uuid1"] = res.uuid;
      session[newSessionId]["original_convuuid1"] = res.conversation_uuid;
      console.log(">>> Outgoing PSTN call status:", res);
      // debug
      console.log("\n >>> Sessions:", session);
      })
    .catch(err => console.error(">>> Outgoing PSTN call error:", err))
  }

});


//============= Processing inbound PSTN calls ===============

//-- Incoming PSTN call --

app.get('/answer', async(req, res) => {

  // const uuid = req.query.uuid;

  //--

  const nccoResponse = [
    {                     //-- this talk action section is optional
      "action": "talk",   
      // "text": "Connecting your call. You may now speak.",
      "text": "Hello and good bye!",
      "language": "en-US",
      "style": 11
    },

    // NEED TO ADD CODE HERE TO PROCESS INCOMING CALLS <<<<<<<<<<<<<<<<<
  ];

  res.status(200).json(nccoResponse);

});

//------------

app.post('/event', async(req, res) => {

  res.status(200).send('Ok');

  if (req.body.recording_url) {

    console.log('req.body.recording_url', req.body.recording_url);
    console.log('req.body.body.conversation_uuid', req.body.conversation_uuid);
  
    await vonage.voice.downloadRecording(req.body.recording_url, './post-call-data/' + req.body.conversation_uuid + '.mp3');

  }
    
});

//--------------

app.post('/event_1', async(req, res) => {

  res.status(200).send('Ok');

 });

//------------

app.post('/ws_event_1', async(req, res) => {

  session[req.query.session]["ws_uuid1"] = req.body.uuid;

  res.status(200).send('Ok');

});

//-----------------------------

app.post('/event_2', async(req, res) => {

  res.status(200).send('Ok');

  //--

  const sessionId = req.query.session;

  console.log(">>>/event_2:\n" + JSON.stringify(req.body));

  // const hostName = req.hostname;
  // const uuid = req.body.uuid;

  // //--

  //   if (req.body.status == 'ringing' && recordCalls) {  

  //   const accessToken = tokenGenerate(appId, privateKey, {});

  //   try { 
  //     const response = await axios.post(apiBaseUrl + '/v1/legs/' + uuid + '/recording',
  //       {
  //         "split": true,
  //         "streamed": true,
  //         "public": true,
  //         "validity_time": 30,
  //         "format": "mp3"
  //       },
  //       {
  //         headers: {
  //           "Authorization": 'Bearer ' + accessToken,
  //           "Content-Type": 'application/json'
  //         }
  //       }
  //     );
  //     console.log('\n>>> Start recording on leg:', uuid);
  //   } catch (error) {
  //     console.log('\n>>> Error start recording on leg:', uuid, error);
  //   }

  // }

  // //--

  if (req.body.type == 'transfer') {  // this is when the party 2 call leg is effectively connected to the named conference

    // transfer party 1 call leg into same conference as where party 2 is already is

    // const ncco = [
    //   {
    //     "action": "conversation",
    //     "name": "conf_" + sessionId, // put in a unique conference name using the session ID
    //     "startOnEnter": true,
    //     // "endOnExit": true
    //   }
    // ];

    const ncco = [
      {
        "action": "transfer",
        "conversationId": req.body.conversation_uuid_to
      }
    ];

    const uuid1 = session[sessionId]["uuid1"]
       
    vonage.voice.transferCallWithNCCO(uuid1, ncco)
    .then(res => console.log(`>>> Party 1 call leg ${uuid1} dropped into same conversation as for party 2`))
    .catch(err => console.error(`>>> Error trying to put party 1 call leg ${uuid1} into same conversation as for party 2`, err))  

  };

});

//------------

app.post('/ws_event_2', async(req, res) => {

  res.status(200).send('Ok');

});

//------------

app.post('/transfer', async(req, res) => {

  res.status(200).send('Ok');

  console.log('>>> /transfer webhook received\n' + JSON.stringify(req.body));

  const hostName = req.hostname;
  const sessionId = req.body.session;
  const uuid1 = session[sessionId]["uuid1"];

  console.log(">> session:\n" + sessionId);
  console.log(">> uuid1:" + uuid1);


  //-- transfer request to human agent from customer (party 1) --

  if (req.body.participant == "customer") {

    if (!session[sessionId]["transfer1"]) { // avoid executing twice as the LLM may send multiple times a tool call request for the same transfer

      //-- Creating call and related websocket for human agent --

      // WebSocket URI for party 2 (e.g. human agent) call leg and necessary parameters
      const wsUri2 = `wss://${processorServer}/socket?participant=human_agent&call_direction=outbound&session=${sessionId}&webhook_base_url=https://${hostName}`;

      //- Outgoing PSTN call to human agent -

      vonage.voice.createOutboundCall({
        to: [{
          type: 'phone',
          number: humanAgentPhoneNumber
        }],
        from: {
         type: 'phone',
         number: servicePhoneNumber  // party 1 phone number, e.g. customer's phone number
        },
        event_url: [`https://${hostName}/event_2?session=${sessionId}`],
        event_method: 'POST',
        ncco: [
          {
            "action": "connect",
            "eventUrl": [`https://${hostName}/ws_event_2?session=${sessionId}`],
            "timeout": "45",
            "from": session[sessionId]["number1"],
            "endpoint": [
              {
                "type": "websocket",
                "uri": wsUri2,
                "content-type": "audio/l16;rate=16000"  // NEVER change the content-type parameter argument
              }
            ]

          }
        ]
        })
      .then(res => {
        session[sessionId]["uuid2"] = res.uuid;
        console.log(">>> Outgoing PSTN call to human agent status:", res);
        // debug
        console.log("\n >>> Sessions:", session);
        })
      .catch(err => console.error(">>> Outgoing PSTN call to human agent error:", err))

      //-- handling customer call leg --

      session[sessionId]["transfer1"] = true; // first time LLM sends a tool call for transfer request

      const ncco = [
        // the announcement is normally by the TTS from WebSocket before this transfer
        // the following TTS is just for tests
        {
          "action": "talk",
          "text": "We are connecting your call to a human agent, please wait",
          "language": "en-US",
          "style": 11
        },
        // this action conversation is necessary to hold the customer call leg until human agent is ready to take this call
        {
          "action": "conversation",
          "name": "conf_" + uuid1, // put in a unique conference name using the customer leg own uuid
          "startOnEnter": true
        }
      ];
         
      vonage.voice.transferCallWithNCCO(uuid1, ncco)
      .then(res => console.log(`>>> Customer call leg  ${uuid1} put on hold`))
      .catch(err => console.error(`>>> Error trying to put customer call leg  ${uuid1} on hold`, err))

      // TO ADD HERE - play MoH to this leg (until human agent takes the call)

    }  

  }


  //-- transfer request from human agent (party 2) to take the call from customer --
  
  if (req.body.participant == "human_agent") {

    if (!session[sessionId]["transfer2"]) { // avoid executing twice as the LLM may send multiple times a tool call request for the same transfer

      session[sessionId]["transfer2"] = true; // first time LLM sends a tool call for transfer request

      //-- handling agent call leg --

      // const ncco = [
      //   // the announcement is normally by the TTS from WebSocket before this transfer
      //   // the following TTS is just for tests
      //   {
      //     "action": "talk",
      //     "text": "We are connecting you with the customer, please wait",
      //     "language": "en-US",
      //     "style": 11
      //   },
      //   {
      //     "action": "conversation",
      //     "name": "conf_" + sessionId, // put in a unique conference name using the session ID
      //     "startOnEnter": true,
      //     // "endOnExit": true
      //   }
      // ];

      const ncco = [
        // the announcement is normally by the TTS from WebSocket before this transfer
        // the following TTS is just for tests
        {
          "action": "talk",
          "text": "We are connecting you with the customer, please wait",
          "language": "en-US",
          "style": 11
        },
        {
          "action": "record",
          "eventUrl": [`https://${hostName}/recordings`],
          "split": "conversation",
          "channels": 2
        },
        {
          "action": "wait",
          "timeout": 60     // in seconds
        }
      ];

      const uuid2 = session[sessionId]["uuid2"]
         
      vonage.voice.transferCallWithNCCO(uuid2, ncco)
      .then(res => console.log(`>>> Agent call leg  ${uuid2} put on hold`))
      .catch(err => console.error(`>>> Error trying to put customer call leg  ${uuid2} on hold`, err))

    }  

  }

});

//------------

app.post('/recordings', async(req, res) => {

  res.status(200).send('Ok');

  console.log('req.body.recording_url', req.body.recording_url);
  console.log('req.body.body.conversation_uuid', req.body.conversation_uuid);

  await vonage.voice.downloadRecording(req.body.recording_url, './post-call-data/' + req.body.conversation_uuid + '.mp3');

});

//-------------

//-- Retrieve call recordings --
//-- RTC webhook URL set to 'https://<this-server>/rtc' for this application in the dashboard --

app.post('/rtc', async(req, res) => {

  res.status(200).send('Ok');

  switch (req.body.type) {

    case "audio:record:done": // leg recording, get the audio file
      console.log('\n>>> /rtc audio:record:done');
      console.log('req.body.body.destination_url', req.body.body.destination_url);
      console.log('req.body.body.recording_id', req.body.body.recording_id);

      await vonage.voice.downloadRecording(req.body.body.destination_url, './post-call-data/' + req.body.body.recording_id + '_' + req.body.body.channel.id + '.mp3');
 
      break;

    case "audio:transcribe:done": // leg recording, get the transcript
      console.log('\n>>> /rtc audio:transcribe:done');
      console.log('req.body.body.transcription_url', req.body.body.transcription_url);
      console.log('req.body.body.recording_id', req.body.body.recording_id);

      await vonage.voice.downloadTranscription(req.body.body.transcription_url, './post-call-data/' + req.body.body.recording_id + '.txt');  

      break;      
    
    default:  
      // do nothing

  }

});
 

//--- If this application is hosted on VCR (Vonage Cloud Runtime) serverless infrastructure --------

app.get('/_/health', async(req, res) => {

  res.status(200).send('Ok');

});

//=========================================

const port = process.env.VCR_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`\nVoice API application listening on port ${port}`));

//------------
