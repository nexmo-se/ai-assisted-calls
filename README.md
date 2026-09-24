# Sample application using Vonage Voice API to handle AI-assisted voice calls and handover to human agents

You may use this Voice API application to connect voice calls to STS or traditional STT-LLM-TTS AI engines including the handling of call transfers to human participants.

Voice calls may be:</br>
inbound/outbound,</br>
PSTN calls (cell phones, landline phones, fixed phones),</br>
SIP calls with [SIP endpoints](https://developer.vonage.com/en/voice/voice-api/concepts/endpoints#session-initiation-protocol-sip) or [Programmable SIP](https://developer.vonage.com/en/voice/voice-api/concepts/programmable-sip),</br>
[WebRTC](https://developer.vonage.com/en/vonage-client-sdk/overview) calls (iOS/Android/Web Javascript clients).</br>

## About this sample Voice API application

This application connects voice calls to a Connector server by using the [WebSockets feature](https://developer.vonage.com/en/voice/voice-api/concepts/websockets) of Vonage Voice API.</br>

When a voice call is established, this Voice API application triggers a WebSocket connection from Vonage platform to the Connector server which streams audio in one or both directions between the voice call and the AI engines.

A human party (e.g. customer) may get connected to another human party (e.g. human agent) after each have first interacted  with an AI assistant.

Instead of using this sample Voice API application, you may use your own existing Voice API application to establish WebSockets with the Connector server to connect your managed voice calls with the AI engines.

Your new or existing Voice API application may be written with any programming language using [server SDKs](https://developer.vonage.com/en/tools) or with direct [REST API](https://developer.vonage.com/en/api/voice) calls.

## Set up

### Set up the sample Connector server - Host server public hostname and port

First set up the Connector server (aka middleware server) from the following repository</br>

Deepgram ASR - OpenAI LLM - ElevenLabs TTS</br>
https://github.com/nexmo-se/dg-oai-11l-connector,</br>

and launch the server application
```bash
node dg-oai-11l-connector-toolcalls.cjs
```

Default local (not public!) of the Connector server `port` is: 6000.

If you plan to test using a `Local deployment`, you may use ngrok (an Internet tunneling service) for both<br>
this Voice API application<br>
and the Connector application<br>
with [multiple ngrok tunnels](https://ngrok.com/docs/agent/config/v2/#tunnel-configurations).

To do that, [install ngrok](https://ngrok.com/downloads).<br>
Log in or sign up with [ngrok](https://ngrok.com/),<br>
from the ngrok web UI menu, follow the **Setup and Installation** guide.

Set up two tunnels,<br>
one to forward to the local port 6000 (as the Connector application will be listening on port 6000),<br>
the other one to the local port 8000 for this Voice API application,<br>
see this [sample yaml configuration file](https://ngrok.com/docs/agent/config/v2/#define-two-tunnels-named-httpbin-and-demo), but it needs port 6000 and 8000 as actual values,<br>
depending if you have a paid ngrok account or not, you may or may not be able to set (static) domain names.

Start ngrok to start both tunnels that forward to local ports 6000 and 8000, e.g.<br>
`ngrok start httpbin demo`

please take note of the ngrok Enpoint URL that forwards to local port 6000 as it will be needed here for this Voice API application environment variable as **`PROCESSOR_SERVER`** in one of the next sections, that URL looks like:<br>
`xxxxxxxx.ngrok.xxx` (for ngrok),<br>
or `myserver.mycompany.com:32000` (public host name and port of your Connector application server)<br>
no `port` is necessary with ngrok as public host name,<br>
that host name to specify must not have leading protocol text such as `https://`, `wss://`, nor trailing `/`.

### Set up your Vonage Voice API application credentials and phone number

[Log in to your](https://dashboard.nexmo.com/sign-in) or [sign up for a](https://ui.idp.vonage.com/ui/auth/registration) Vonage APIs account.

Go to [Your applications](https://dashboard.nexmo.com/applications), access an existing application or [+ Create a new application](https://dashboard.nexmo.com/applications/new).

Under Capabilities section (click on [Edit] if you do not see this section):

**Enable** Voice
- Under Answer URL, leave HTTP GET, and enter</br>
https://\<host\>:\<port\>/answer</br>
(replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>
- Under Event URL, **select** HTTP POST, and enter</br>
https://\<host\>:\<port\>/event</br>
(replace \<host\> and \<port\> with the public host name and if necessary public port of the server where this sample application is running)</br>
Note: If you are using ngrok for this sample application, the answer URL and event URL look like:</br>
https://yyyyyyyy.ngrok.xxx/answer</br>
https://yyyyyyyy.ngrok.xxx/event</br> 	
- Click on [Generate public and private key] if you did not yet create or want new ones, save the private key file in this application folder as .private.key (leading dot in the file name).</br>

- Make sure a value is selected in the dropdown under **Region**</br>
_Note: There is no need to set a region in the application code itself_

- Click on [Generate new application] if you've just created the application.</br></br>

**IMPORTANT**: If you already have an existing application and just changed some parameter values including created a new public and private key set, do not forget to click on [Save changes] at the bottom of the screen.</br></br>

- Link a phone number to this application if none has been linked to the application.</br>

Please take note of your **application ID** and the **linked phone number** (as they are needed in the very next section).

For the next steps, you will need:</br>
- Your [Vonage API key](https://dashboard.nexmo.com/settings) (as **`API_KEY`**)</br>
- Your [Vonage API secret](https://dashboard.nexmo.com/settings), not signature secret, (as **`API_SECRET`**)</br>
- Your `application ID` (as **`APP_ID`**),</br>
- The **`phone number linked`** to your application (as **`SERVICE_PHONE_NUMBER`**), your phone will **call that number**.</br>

### Local deployment

Copy or rename .env-example to .env<br>
Update parameters in .env file<br>
Have Node.js installed on your system, this application has been tested with Node.js version 22.16<br>

Install node modules with the command:<br>
 ```bash
npm install
```

Launch the server application with either of the following commands:<br>
```bash
node ai-assisted-calls
```

Default local (not public!) `port` of either server application is: 8000.

### How to make PSTN calls

#### Outbound calling

To manually trigger an outbound PSTN call to a number, open a web browser, enter the address:<br>

_https://\<server-address\>/call?number=\<number\>_<br>

the \<number\> must be in E.164 format without leading '+' sign, nor space, '-', '.' characters

for example, it looks like

https://xxxx.ngrok.xxx/call?number=12995551212

- Upon answering the call, the first party (e.g. customer) will get connected to the AI engine(s) via a WebSocket,
- then at some point the first party may say "Transfer my call to a human agent" (or something similar),
- the AI engine triggers a tool calling (generating a "/transfer" webhook from the Connector server application to this Voice API server application) at which point the first party call is put on hold and the WebSocket to the AI engine(s) is terminated,
- in parallel, a call to the second party (e.g. human agent) is initiated which upon answer is connected via WebSocket to the AI engine(s),
- then at some point the second party may say "Transfer my call to the customer" (or something similar) 
- the AI engine triggers a tool calling (generating a "/transfer" webhook from the Connector server application to this Voice API server application) at which point the second party call is put on hold and the WebSocket to the AI engine(s) is terminated,
- 2-channel audio recording is started,
- the first party call is transferred and bridged to the second party call to start a human to human phone conversation,
- on call termination, the 2-channel audio recording file is available.


Of course, you may programmatically initiate outbound calls by using the API call listed in the corresponding webhook section, i.e. `/call` route, of the program<br>
_ai-assisted-calls.js_<br>

#### Inbound calling

Implementation has not yet been done.



