ApiLoadGen
==========

Load Generator tool for APIs


Overview
----------------------

This is a toolset that
manages "jobs" that generate requests for APIs. It was built by Apigee. 

The objective is to be able to generate "synthetic" load - fake load -
on an API, which allows testing, as well as source data that results in 
interesting-looking data charts and tables in Apigee Analytics. 

The "job definition" includes rules and parameters that specify which
APIs to invoke, and how, and when, and how often, in what order, and
with what parameters or payloads.

Specific ettings within a job definition include: the volume of requests
for a given time of day; the set of requests that should be performed in
a sequence, including any of the contents of an HTTP request; whether to
vary the X-Forwarded-For header, authentication information, and other
things.

The progression of contrived requests constitutes the artificial "load"
on an API.


Status
----------------------

This is currently a work in progress. It's getting there.


Interesting Files
----------------------

* `server4.js`  
  a simple REST server implemented in nodejs, with express.  For the http client function it uses slimNodeHttpClient. It relies on q for promises.  Accepts APIs on the jobs under management. 

* `slimNodeHttpClient.js`  
  a slim http client for node that implements q's promises. The base http client in node is heinous. This gets require'd by server4.js 

* `weightedRandomSelector.js`  
  a module that provides a weighted random selector. This allows the server to randomly select a city based on population, for each request. It would make more sense to select a city per job. Anyway, this is the beginning of specifying a contrived X-Forwarded-For header. 

* `etl1.js`  
  a simple command-line nodejs tool that loads the specified "model" file for a job into App Services. 

* `FileReader.js`  
  a line-by-line file reader for nodejs, used by parseCitiesPop.js

* `parseCitiesPop.js`  
  a one-time use program to parse the txt file containing the list of US cities and population from wikipedia, and populate App Services with that data. 

* `model.json` and `model2.json`  
  example model files for use with etl1.js

* `ui/index.htm`  
  an angularJS client that connects to the REST server to inquire as to the jobs avaiable, and the run status of each one. 



Less Interesting Files
----------------------------------

These were constructed during the R&D effort.  I may remove these later.

* `server3.js`  
  a simple REST nodejs server, similar to server4.js  above, but implemented with restify for the http client and server. Accepts APIs on the jobs under management. I'm no longer updating this module. 

* `retrieve1.js`  
a Nodejs program intended for use from the command line. It shows how to retrieve the "job model" from App Services

* `run3.js`  
another nodejs command-line tool, shows how to retrieve the all the stored jobs, and then run each one.



Data Model
----------------------

The NodeJS app is itself strictly an API server.  It presents a simple
interface to manage resources known as jobs. The main point is to
generate load, but before generating load we have to know what kind of
requests to send. This is described in the data model.

Jobs consist of a server name and scheme, a set of default http headers
to send with each request, 1..N "included" request sequences, and a
reference to a load-profile entity, which simply describes how many
requests to make in a given hour of the day.

All of the job definition metadata is stored in App Services. Jobs are
linked to sequences within App Services via the "includes" entity
relationship, so that a GET on
`api.usergrid.com/org/app/jobs/{job-id}/includes/sequences` will give
all the sequences for a job.  Likewise there is a "uses" relationship
that links jobs to the load profile.  But actually the Loadgen server
completely wraps the App Services store, so that a client of the loadgen
API server need not know about the details of the storage or these
entity relationships.

In more detail, a sequence consists of 1..M "requests", a desired
iteration count for the sequence (1..?), and a time to delay between
successive iterations. Here again, a link in App Services connects
sequences to its requests, but this is not apparently to loadgen client applications. 

A request consists of a descriptive name, an HTTP verb, a url path, a
set of 0..P HTTP headers particular for this request, optionally a
payload for the request, and a set of extractions to evaluate from the
response.

For example:

* `GET /jobs`  
    Get the list of defined jobs. Though in App
    Services there are distinct entities of type {jobs, sequences,
    requests, lprofile}, the loadgen server exposes just one toplevel
    entity type: jobs

* `GET /jobs/{job-id}`  
   Does the obvious. 

* `PUT /jobs/{job-id}`  
   Partial put to update an entity definition.
   This isn't implemented yet!

* `POST /jobs`  
    create a new job, given the posted entity definition.
    This isn't implemented yet! 


Example: A typical flow might be a job with 2 sequences; the first will
consist of a single request, that sends a username/password to obtain a
token, and then extracts the OAuth Bearer token from the payload.  The
second sequence consists of a series of 3 requests that is performed a
variable number of times, each time sending the extracted token in an
Authorization header.


Job Control
----------------------

In addition to the data access APIs shown above, there are a few job control APIs:

* `POST /jobs/{job-id}?action=start`  
   to begin running the job. The job runs "forever".  The payload should be a
   application/json containing the initial context for the job.
   Example:

    curl -i -X POST "http://localhost:8001/jobs/d73f14f4-f3b2-11e2-b505-6124ac12ea5b?action=start"
        -H "Content-Type: application/json"
        -d '{"username":"Larry", "password" : "HopefulPressue"}'

   Then, request headers and payload can reference these values as with {username} or {password}.


* `POST /jobs/{job-id}?action=stop`  
   to stop running the job.


The "run status" of a job is known only to the loadgen server.  It is
not stored in App Services, as this status depends on the loadgen server
process continuing to operate. A "running" job implies a pending
setTimeout() call in the Nodejs process; when it fires, the loadgen
server sends out the next round of requests.  When the loadgen server
shuts down, any setTimeout() calls for "running" jobs then become
irrelevant, and so all jobs that were previously running are now
stopped.

This implies that if multiple loadgen servers are running at the same
time, they will have multiple independent views of the run status of any
job. In fact 2 loadgen servers could both run the same job, which would
imply double the configured load on a given API.  Resolving this is left
for a future version of this code.


Creating a Job
----------------------

The resource model in App Services is

    /jobs/{job-id}
    /jobs/{job-id}/includes/
    /jobs/{job-id}/includes/{sequence-id}
    /jobs/{job-id}/includes/{sequence-id}/references
    /jobs/{job-id}/includes/{sequence-id}/references/{request-id}


To fully create a complete job definition the loadgen server must:
  - create the basic job
  - add sequences to the job
  - add requests to each sequence
  - create a load profile and add it to the job

Each of these steps requires an HTTP REST call to App Services. 

There is a command line tool that loads jobs into App Services: etl1.js

It wraps that storage model, so that you can pass it a single object graph, and
it will decompose that object and store it all appropriately into App Services.
This is currently the easiest way to create new jobs. 

To use etl1.js , create the job definition in json format, in a text file using
your favorite text editor.  Then run the etl1.js script, specifying the name of
that file.  It will create a new job in the store.

As a future enhancement, I may modify the loadgen tool so that it also performs
this work, and I may implement a suitable UI for that purpose. This is not yet
implemented. For now use etl1.js. 

The job definition should look something like this example: 

    {
      "name": "job2",
      "description": "Exercise APIs exposed by Sonoa",
      "geoDistribution": 1,
      "defaultProperties": {
        "scheme": "https",
        "host": "demo18-test.apigee.net",
        "headers" : {
          "Accept" : "application/json"
        }
      },

      "loadprofiles" : [{ 
        "name" : "loadprofile1", 
        "perHourCounts" : [
          44, 35, 40, 36, 27, 40, 40, 54, 
          57, 62, 54, 61, 73, 70, 53, 50, 
          47, 62, 74, 88, 83, 77, 70, 51
        ] 
      }], 

      "sequences" : [
        {
          "description" : "login",
          "name" : "seqLogin",
          "iterations" : 1,
          "requests" : [ {
            "type" : "request",
            "name": "login",
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
          "type" : "sequence",
          "name" : "seqQuery1",
          "description" : "query user item (self)",
          "iterations" : "1",
          "requests" : [ 
            {
              "name" : "retrieveUser",
              "url" : "/v1/ictrl/{hrefs.user}",
              "method" : "get",
              "headers" : {
                "authorization" : "Bearer {oauth_bearer_token}"
              }, 
              "delayBefore" : 10
            },
            {
              "name" : "retrieveSite",
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


Most of these properties are self-explanatory. Some comments on others. 

The geoDistribution property on the job specifies whether to simulate
geo-distributed load as the job runs, via the X-Forwarded-For header.
Set this property to zero in the job definition if you do not want
geo-distributed load. If you omit the property, you get the default,
which is geo distributed load.

The url property in the request specifies a relative or absolute URL. If
you specify a relative url, then the scheme and domain name from the
"job defaults" will be prepended to the url before it is used.  If you
specify a fully qualified url, then the "job defaults" values are
ignored for that request.



Some additional details:
-------------------------

The extracts, payload, and delayBefore are all optional parts of a request. The
payload makes sense only for a PUT or POST. It's always JSON.  The extracts is
an array of objects, each of which contains a description, the name of a
variable, and a function, specified in JavaScript. These functions accept two
arguments, the body and the headers, and get evaluated after the response has
been received for the request. The return value of the function gets stored in
a context variable with the name specified in "valueRef".  The description for
the extract is just for documentation purposes.

For example, an extract like this:

    {
      "description" : "extract the login token",
      "fn" : "function(body, hdrs) {return body.login.token;}",
      "valueRef" : "login_token"
    }, 

...when given a response payload (body) like this: 

    { login: { token: "AAABBBCCC" } } 

...will extract the value AAABBBCCC and insert it into a context variable called
login_token. This variable will then be available for use in the headers or
payloads of subsequent requests in the sequence or the requests of subsequent
sequences, using templates.  Curly braces denote the values to inject. 

For example, to later insert the values of these context variables into
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

If you need a curly-brace enclosed thing in your string and don't want
it to be expanded or interpreted at runtime, use double-curlies. This

     "/foo/bar/{{baz}}"

...resolves to 

     /foo/bar/{baz}


I recommend that you use single quotes within the extract functions.
Or, escape the double quotes.


If you want the request rate to vary over time, you need to specify a load profile in
the job. A load profile is very simply, a list of numbers specifying the target
number of job runs per hour, for hours 0..24.

Add a load profile to a job like this:

    {
      "name": "myloadprofile",
      "perHourCounts": [44, 35, 40, 36, 27, 40, 40, 
      54, 57, 62, 54, 61, 73, 70, 53, 50, 
      47, 62, 74, 88, 83, 77, 70, 51]
    }

The array called `perHourCounts` should be the number of times the job should
run per hour, for each hour from 0 to 23. Be thoughtful about choosing these
numbers. Jobs that have many requests may take a minute to run or more, in which
case running 60 of those per hour is impractical. The way it works is, the
server divides the time in an hour by the number of times to run the job. This
give the interval on which to invoke one job.

If you do not add a load profile to a job, the server defaults to running the
job N times per hour. Currently N is 60, so such a job runs once every 60
seconds, all day long. This will work but it won't give you a very nice
analytics load chart, because load does not vary over itme.



Design Notes
----------------------

The server3.js file uses the q module for promises, which is a framework
for managing ordered execution of asynchronous operations. When you have
a chain of asynch operations that you'd like to perform in order, like a
series of HTTP calls, and the subsequent operation should be performed
only after the prior operation completes, you can design a giant pyramid
of nested callbacks, or you can use promises to untangle that mess.

Read more at https://github.com/promises-aplus/promises-spec

In loadgen, a sequence of requests is really a sequence of HTTP calls, and some
housekeeping (extractions, forced delays), around those calls. In this
implementation, each of those requests is a promise, which runs
asynchronously. A sequence therefore results in a chain of linked promises.

Each promise receives a "context", which it uses to run its
request. Within the context are things like: the job definition (which
requests to run, how often, in what order, etc), the state of the job
(eg, which sequence is currently executing, which iteration of that
sequence, and within the sequence which request is next to run), the
http client object to use for the outbound requests, the values
extracted from previous responses, the job start time, and so on. Each
promise updates its context and then returns it, which allows chaining
to the next promise.

When running a job, the chain of promises for a job stops when the last
request of the last iteration of the last sequence finishes. At that
point, the server adds a setTimeout() call as the last link in the
promise chain.  This timeout wakes up after the appropriate time given
the desired rate of requests for that job (remember, that rate varies by
hour) to begin running the job again.

In this way, the context flows through the chain and is accessible to
each asynchronous outbound http request.

"Starting a job" implies kicking off this chain of promises, and storing
the jobid and its timeout object in an in memory hashtable called
"activeJobs". Stopping a job involves cancelling the timeout associated
to the given jobid. There's a race condition here. 


Operations Notes
----------------------

The JS files here are NodeJS scripts.  They also require some other node
modules, including: q, sleep, assert, and fs.  To run these sripts, including
server4.js, you may have to:

 `$ npm install q sleep`

in your local directory.



Bugs
----------------------

- OPTIONS and HEAD are not yet supported as verbs in the requests that comprise a job
- In the loadgen server, the job store is hardcoded as an App Services org+app under my personal account. This should be specifyable in the UI.
- The companion UI to manage job definitions is pretty limited and ugly.
- When the token to contact App Services expires, the loadgen server stops work, unable to read jobs. Need to implement token refresh.
- Currently the loadgen server allows outbound calls within a job to specify a variable X-Forwarded-For header.  The load distribution is always based on population distribution. This works, but  there should be a way to allow different distributions for XFF.
- it is not possible to change the logging verbosity in the loadgen server. 
- loadgen jobs do not handle xml requests or responses, or anything non-JSON. This is probably a low priority bug. 
