ApiLoadGen
==========

Load Generator tool for APIs


Overview
----------------------

This is a tool that generates artificial load for APIs. It was built by
Apigee, to aid in testing and exercising API proxies and servers.

The objective is to be able to generate "synthetic" load on an API,
for testing purposes. This load also causes the Apigee Gateway to generate
analytics records, which results in interesting-looking data charts and
tables in the Apigee Analytics UI. The tool is like jmeter, but oriented
towards APIs and it runs as a Nodejs app.

You define the load you want - the API calls you want to make - via a
"job definition". The definition includes which hosts and urlpaths to
invoke, with what headers and verbs and payloads, and when, and how
often, in what order, and so on. The Job definition is serialized as a
json file.

The loadgen server reads the job definition and invokes the APIs from
the server. This constitutes the artificial "load" on an API server.

Status
----------------------

This project is basically functional. We're improving it. 


Quick Start
----------------------

To use loadgen server, there are three steps:

 1. Create the job definition. 

 2. Provide the job definition to the loadgen server

 3. Start the job.  


After you perform steps 1 & 2 once, you never need to perform them
again. Job definitions are stored persistently. 

Defining a job consists of writing a JSON file.  Here's a very simple example. 

    {
      "name": "job1",
      "description": "Login to the Sonoa service",
      "defaultProperties": {
        "scheme": "https",
        "host": "api.sonoasystems.net",
        "headers" : {
          "Accept" : "application/json",
          "content-type" : "application/json"
        }
      },

      "initialContext" : {
          {"username":"Chris", "password":"Haljous#"}
      },

      "sequences" : [{
        "description" : "login",
        "iterations" : 1,
        "requests" : [ {
          "url" : "/v1/login",
          "method" : "post",
          "payload" : {
            "username":"{username}",
            "password":"{password}"
          }]
        }]
      }]
    }


In English, what this says is: the job will invoke urls on the server at
https://api.sonoasystems.net. It will send and receive
application/json. There will be just one sequence of requests, and in
that sequence just one request.  That request will POST to the url path
/v1/login . It will provide as a payload, a json object containing a
username and password. 

Running this job would exercise the login function of a fictitious
sonoasystems API, once per minute, all day long.

The initialContext property on the job provides the initial set of
context data items. These will be accessible via templates, that you can
apply to headers or urls or payloads on requests. In this example, the
data items in the payload get values from the context.  You could also
specify a url this way:

   /v1/test/{href} 

This will replace {href} with the value of the href property in the context. 

The url property in the request specifies a relative or absolute URL. If
you specify a relative url which begins with a slash, then the scheme
and domain name from the "job defaults" will be prepended to the url
before it is used.  If you specify a fully qualified url, which begins
with a scheme (http or https), then the "job defaults" values are ignored
for that request.

There are a few other things you can do with jobs; more on that later. 


OK that was step 1: defining the job. 

Step 2 is loading the job definition into the loadgen server. 

This is done today with the etl5.js nodejs utility. Run it from the
console.  If you have an invalid json, the script will display an
error. Fix your json and try again. If this succeeds it will display a
job UUID. You need this. Keep it.


Step 3 is to start the job. Do this by first, starting the loadgen
server itself, then sending it a command to start your particular job.
You do need an access token before doing that.  Here are the steps:

3a. Start the server:

    node server5.js

3b. Authenticate to get a token: 

    curl -i -X POST -H "content-type: application/json" 
            -H "X-Appsvcs: dino:loadgen2" 
          http://localhost:8001/token 
          -d '{"username" : "Operator2", "password" : "shhhhhhh!!!" }' 

All that should be on one line.  The X-Appsvcs header specifies the org
and app of Apigee App Services where the jobs are stored for this
session. The username and password must be creds that are valid on that
org+app. The loadgen server uses these creds to login to app services
and retrieve jobs on your behalf.

In response to that request, you will get a payload with an access
token. Like this:

    {
      "access_token": "YWMtXXdgriWZEeOp0afTzC4WrwAAAUF3YmCFy2cXSTpZQ68WSpM7vkwFRmtjJsE",
      "expires_in": 604800,
      ...
    }

3c. Use that access token as a bearer token in all subsequent requests.

For example if the uuid of your job is d73f14f4-f3b2-11e2-b505-6124ac12ea5b ,
then you could start the job this way: 

    curl -X POST -H "Authorization: Bearer $token" 
           "http://localhost:8001/jobs/d73f14f4-f3b2-11e2-b505-6124ac12ea5b?action=start"  

...where $token is replaced with the token you received in response to
the prior command. And that's it. The job will begin to run. If you want
to pass an initial context that the job can use, pass it as the payload,
like this:

    curl -X POST -H "Authorization: Bearer $token" -H "content-type: application/json"
           "http://localhost:8001/jobs/d73f14f4-f3b2-11e2-b505-6124ac12ea5b?action=start"  
          -d '{ "username": "Himself" , "password" : "NeverToBeRevealed" }'

This initial context will add to any initial context specified in the
job itself. Any property names common in both places will get
overwritten by the props passed in the start command.

3d. The loadgen server then runs this job "forever" until you stop the node
server or until you send it the appropriate "stop job" command.

    curl -X POST  -H "Authorization: Bearer $token" 
           "http://localhost:8001/jobs/d73f14f4-f3b2-11e2-b505-6124ac12ea5b?action=stop"  



An Example with Extracts
--------------------------------

Consider this job definition:

    {
      "name": "job2",
      "description": "Exercise APIs exposed by Sonoa",
      "geoDistribution": 1,
      "defaultProperties": {
        "scheme": "https",
        "host": "api.sonoasystems.net",
        "headers" : {
          "Accept" : "application/json"
        }
      },

      "initialContext" : {
        "something" : "a-value-here",
        "prop2" : "another-value"
      },

      "invocationsPerHour" : [
          44, 35, 40, 36, 27, 40, 40, 54,
          57, 62, 54, 61, 73, 70, 53, 50,
          47, 62, 74, 88, 83, 77, 70, 51
      ],

      "sequences" : [
        {
          "description" : "login",
          "iterations" : 1,
          "requests" : [ {
            "url" : "/v1/ictrl/login",
            "method" : "post",
            "headers" : {
              "content-type" : "application/json"
            },
            "payload" : {
              "username":"test",
              "password":"password"
            }, 
            "delayBefore" : 0,
            "extracts" : [
              {
                "description" : "extract the login token",
                "fn" : "function(obj) {return obj.login.token;}",
                "valueRef" : "oauth_bearer_token"
              }, 
              {
                "description" : "extract the user and site hrefs",
                "fn" : "function(obj) {var re1=new Regexp('^/[^/]+/[^/]+(/.*)$'), m1,m2; m1=re1.exec(obj.login.user.href); m2=re1.exec(obj.login.site.href); return {user:m1[1],site:m2[1]};}",
                "valueRef" : "hrefs"
              }
            ]
          }]
        },
        {
          "description" : "query user item (self)",
          "iterations" : "Math.floor(Math.random() * 5) + 4",
          "requests" : [ 
            {
              "url" : "/v1/ictrl/{hrefs.user}",
              "method" : "get",
              "headers" : {
                "authorization" : "Bearer {oauth_bearer_token}"
              }, 
              "delayBefore" : 10
            },
            {
              "description" : "retrieve the site",
              "url" : "/v1/ictrl/{hrefs.site}",
              "method" : "get",
              "headers" : {
                "authorization" : "Bearer {oauth_bearer_token}"
              }, 
              "delayBefore" : 10
            }
          ]
        }
      ]
    }

This job definition adds a few things: extracts, invocationsPerHour, 
a random number of iterations, and geoDistribution. 

At runtime, the functions provided in the 'extracts' array run on the
response, and the return values of those functions get placed as
additional values in the job context. These new values can subsequently
be referenced in templates, as described previously. In this example,
the oauth_bearer_token is extracted and inserted as a bearer token in
all subsequent requests. You can get pretty fancy with the extracts,
specifying values in the payload or the url path. 

The top-level property named "invocationsPerHour" tells the loadgen
server the number of jobs to run in each hour of the day.  This isn't
the number of requests, it's the number of jobs, each of which may have
numerous requests. So be careful. If you set this to 60, you will get 60
jobs per hour, one per minute. This number specifies a target. The
loadgen server can't guarantee that it will run this number of jobs. For
example, suppose your jobs take more than 60 seconds to run. If you then
specify 60 jobs per hour, the loadgen server will not finish the first
job before it needs to start the second. This won't ever happen as the
loadgen server serialized the job requests. So be aware.

The geoDistribution property on the job specifies whether to simulate
geo-distributed load as the job runs, via the X-Forwarded-For header.
Set this property to zero in the job definition if you do not want
geo-distributed load. If you omit the property, or set it to non-zero,
you get the default behavior, which is an X-forwarded-for header that
simulates geo distributed load.

This job also includes multiple sequences with multiple requests in
each. The second sequence in this example shows how to specify a random
number of iterations. Just use a snip of javascript code that uses
Math.random().



A Final Example
--------------------------------

Consider this job definition: 

    {
      "name": "job1",
      "description": "Login to the Sonoa service",
      "defaultProperties": {
        "scheme": "https",
        "host": "api.sonoasystems.net",
        "headers" : {
          "Accept" : "application/json",
          "content-type" : "application/json"
        }
      },

      "initialContext" : {
        "creds" : [
          {"username":"Chris", "password":"Haljous#"},
          {"username":"Andrea", "password":"92iu2011"},
          {"username":"Jordan", "password":"ikindalikeapis@#"}
        ]
      },

      "sequences" : [{
        "description" : "login",
        "iterations" : 1,
        "requests" : [ {
          "url" : "/v1/login",
          "method" : "post",
          "imports" : [ {
            "description" : "choose a set of credentials",
            "fn" : "function(ctx) {return Math.floor(Math.random() * ctx.creds.length);}",
            "valueRef" : "credNum"
          }],
          "headers" : {
            "authorization" : "Basic {Base64.encode({creds[credNum].username + ':' + creds[credNum].password)}"
          },
          "extracts" : [ {
            "description" : "extract the login token",
            "fn" : "function(obj,hdr) {return obj.login.token;}",
            "valueRef" : "oauth_bearer_token"
          }]
        }]
      }]
    }

This one includes a new property on the request - "imports".  The imports
are functions that run and inject values into the context. 

The imports are similar to the extract functions; the imports run before
the call and get only the context. The extract functions run after the
call returns, and get the payload and the header collection as arguments.
Both import and extract functions can inject values into the context.

In this example, the import selects one of the N credentials that are
available in the initial context. The number is injected into the
context as credNum. Then, the payload is contrived using a template that
relies on that credNum value.

Also, this example shows how to use the Base64 object in a template. 
The Base64 object includes an encode and a decode function. 


Interesting Files
----------------------

* `server5.js`  
  a  REST server implemented in nodejs, with express.  For the http client function it uses slimNodeHttpClient. It relies on q for promises.  Accepts APIs on the jobs under management. 

* `slimNodeHttpClient.js`  
  a slim http client for node that implements q's promises. The base http client in node is heinous. This gets require'd by server4.js . It is used for all outbound http communications including those to App Services. We could use the app services nodejs client library, but then there are other outbound requests that go to arbitrary http endpoints. This server uses a common http client library for the purpose. 

* `weightedRandomSelector.js`  
  a module that provides a weighted random selector. This allows the server to randomly select a city based on population, for each job. Then, using the geo-to-ip database, it selects an IP address to insert into the contrived X-Forwarded-For header. 

* `etl5.js`  
  a simple command-line nodejs tool that loads the specified "model" file for a job into App Services. 

* `model.json` and `model2.json`  
  example model files for use with etl1.js

* `ui/index.htm`  
  an angularJS client that connects to the REST server to inquire as to the jobs avaiable, and the run status of each one. 



Job Control
----------------------

The "run status" of a job is known only to the loadgen server. A running
job implies a pending setTimeout() call in the Nodejs process; when it
fires, the loadgen server sends out the next round of requests.  When
the loadgen server shuts down, any setTimeout() calls for "running" jobs
then become irrelevant, and so all jobs that were previously running are
now stopped. Hence the run state is ephemeral and known only to the
instance of the job server.

If multiple loadgen servers are running at the same time, they will have
multiple independent views of the run status of any job. In fact 2
loadgen servers could both run the same job, which would imply double
the configured load on a given API. Resolving this is left for a future
version of this code.



Creating a Job
----------------------

There is a command line tool that loads jobs into App Services: etl5.js

To use etl5.js , create the job definition in json format, in a text
file using your favorite text editor.  Then from a bash prompt, run the
etl5.js script, specifying the name of that file.  It will create a new
job in the store.


BUG - must modify etl5.js to specify the org/app and app services creds. 

As a future enhancement, I may modify the loadgen tool so that it also performs
this work, and I may implement a suitable UI for that purpose. This is not yet
implemented. For now use the command-line script. 



Some additional details:
-------------------------

The imports, extracts, payload, and delayBefore are all optional parts of a
request. The payload makes sense only for a PUT or POST. It's always JSON.
The extracts is an array of objects, each of which contains a description,
the name of a variable, and a function, specified in JavaScript. These
functions accept two arguments, the body and the headers, and get evaluated
after the response has been received for the request. The return value of
the function gets stored in a context variable associated to the job with
the name specified in "valueRef".  The description for the extract is just
for your own documentation purposes.

For example, an extract like this:

    {
      "description" : "extract the login token",
      "fn" : "function(body, hdrs) {return body.login.token;}",
      "valueRef" : "login_token"
    }, 

...when given a response payload (body) like this: 

    { login: { token: "AAABBBCCC" } } 

...will extract the value AAABBBCCC and insert it into a context variable
called login_token. The context is attached to the job, and is then
accessible to any subsequent request in the job.

The import functions work the same way but they accept only the context
as an argument. This way you could inject into the context some value
that depends on other existing vaues in the context. The imports run
before payloads, headers, and urlpaths are determined for calls; the
extracts run after the calls return.

The contents of context values can be inserted into the headers, paths, or
payloads of subsequent requests in the sequence or the requests of subsequent
sequences, using templates.  Curly braces denote the values to inject. 

For example, to insert the values of context variables into
the headers or payloads of subsequent outbound requests, specify things
like this:

      "headers" : {
        "authorization" : "Bearer {login_token}"
      }, 

...or

      "payload" : {
        "token":"{login_token}",
        "otherStuff":"ABCDEF"
      }, 

...or

      "url" : "/foo/bar/{href}",


You can employ multiple curly-brace enclosed templates in each string,
like this:

      "url" : "/foo/{key}/{href}"

...which is equivalent to :

      "url" : "/foo/{key + '/' + href}"

This works in any string: in the url, in a header, or in an arbitrary
payload property. If you need a curly-brace enclosed thing in your string
and don't want it to be expanded or interpreted at runtime, use
double-curlies. Therefore, this

     "/foo/bar/{{baz}}"

...resolves to 

     /foo/bar/{baz}

I recommend that you use single quotes within the extract and import
functions.  Or, escape the double quotes.



If you want the request rate to vary over time, you need to specify a load profile in
the job. A load profile is very simply, a list of numbers specifying the target
number of job runs per hour, for hours 0..24.

Add a load profile to a job like this:

    "invocationsPerHour": [44, 35, 40, 36, 27, 40, 40, 
      54, 57, 62, 54, 61, 73, 70, 53, 50, 
      47, 62, 74, 88, 83, 77, 70, 51]


The array called `invocationsPerHour` should be the number of times the
job should run per hour, for each hour from 0 to 23. Be thoughtful about
choosing these numbers. Jobs that have many requests may take a minute
to run or more, in which case running 60 of those per hour is
impractical. The way it works is, the server divides the time in an hour
by the number of times to run the job. This give the interval on which
to invoke one job.

If you do not add a load profile to a job, the server defaults to
running the job N times per hour. Currently N is 60, so such a job runs
once every 60 seconds, all day long. This will work but it won't give
you a very nice analytics load chart, because load does not vary over
itme.


Operations Notes
----------------------

The JS files here are NodeJS scripts. They also require some other node
modules, including: express, q, sleep, assert, and fs.  To run these
sripts, including server5.js, you may have to:

 `$ npm install`

in your local directory.



Bugs
----------------------

- OPTIONS and HEAD are not yet supported as verbs in the requests that comprise a job
- The companion UI to manage job definitions is pretty limited and ugly.
- When the token to contact App Services expires, the loadgen server stops work, unable to read jobs. Need to implement token refresh.
- Currently the loadgen server allows outbound calls within a job to specify a variable X-Forwarded-For header.  The load distribution is always based on population distribution. This works, but  there should be a way to allow different distributions for XFF.
- it is not possible to change the logging verbosity in the loadgen server. 
- loadgen jobs do not handle xml requests or responses, or anything non-JSON. This is probably a low priority bug. 
