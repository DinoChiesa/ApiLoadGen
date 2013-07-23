ApiLoadGen
==========

Load Generator tool for APIs


Overview
----------------------

This is (going to be) a server-based NodeJS app that
manages "jobs" that generate requests for APIs, according to
rules and parameters set out in a job definition. Settings
within a job definition include: the volume of
requests for a given time of day; the set of requests that should
be performed in a sequence, including any of the contents of an
HTTP request; whether to vary the X-Forwarded-For header,
authentication information, and other things.

The contrived requests then constitute an artificial "load" on an
API. The ability to generate artificial load can serve a number of
uses. In particular, if these requests are directed to an interface that
is managed by the Apigee API Manager, it allows the Apigee Analytics
charts to present interesting-looking data.


Data Model
----------------------

The NodeJS app is itself strictly an API server.  It presents a simple
interface to manage resources known as jobs, sequences, and
requests. The main point is to generate load, but before generating load
we have to know what kind of requests to send. This brings us to the
data model.

Jobs consist of a server name and scheme, a set of default http headers
to send with each request, 1..N "included" request sequences, and a
reference to a load-profile. (FYI: All of the job definition metadata
is stored in App Services. In this case, "includes" is an App Services
entity relationship, so that a GET on
`/org/app/jobs/{job-id}/includes/sequences` will give all the
sequences. But actually this server obscures the /org/app part of the
App Services url, so the url starts with /jobs....)  The load profile
simply describes how many requests to make in a given hour of the day.

A sequence consists of 1..M "request implementations", a desired
iteration count for the sequence (1..?), and a time to delay
between iterations. The request implementations are a child
object containing a reference to a request entity (==uuid), and a set of
extractions to perform on the response.

A request consists of a descriptive name, an HTTP verb, a url
path, a set of 0..P HTTP headers particular for this request, and
optionally a payload for the request.


For example:

* `GET /{entity-collection}`
    Get the list of defined entities of the given type. The collection
    should be one of {jobs, sequences, requests, lprofile}

* `POST /{entity-collection}`
    create a new entity, given the posted entity definition.

* `GET /{entity-collection}/{entity-id}`

* `PUT /{entity-collection}/{entity-id}`
   partial put to update an entity definition.


Example: A typical flow might be a job with 2 sequences; the first will
consist of a single request, that obtains a token, and then extracts the
OAuth Bearer token. The second sequence consists of a series of 3
requests that is performed a variable number of times using that token.



Job Control
----------------------

In addition to the data access APIs shown above, there are a few job control APIs:

* `POST /jobs/{job-id}?action=start`
   begin running the job. The job runs "forever".  The payload should be a
   application/json containing the initial context for the job.
   Example:

    curl -i -X POST "http://localhost:8001/jobs/d73f14f4-f3b2-11e2-b505-6124ac12ea5b?action=start"
        -H "Content-Type: application/json"
        -d '{"username":"Larry", "password" : "HopefulPressue"}'

   Then, request headers and payload can reference these values as with {username} or {password}.



* `POST /jobs/{job-id}?action=stop`
   stop running the job.




Status
----------------------

This is currently a proof of concept. The nodejs server
app doesn't really do job control just yet. I'm getting there.



Interesting Files
----------------------

* `retrieve1.js`
a Nodejs program intended for use from the command line. It shows how to retrieve the "job model" from App Services


* `run3.js`
another nodejs command-line tool, shows how to retrieve the all the stored jobs, and then run each one.

* `server3.js`
a simple REST server implemented with nodejs + restify. Accepts APIs on the jobs, sequences, and requests under management.




Notes
----------------------

The JS files here are NodeJS scripts.  They also require some other
node modules, including: q, sleep, restify, assert, and fs.  To run these sripts you may have to:

 `$ npm install q restify sleep`

in your local directory.


The q module implements promises, which is a framework for managing
ordered execution of asynchronous operations. When you have a chain of
asynch operations that you'd like to perform in order, like a series of
HTTP calls, and the subsequent operation should be performed only after
the prior op completes, you can design a giant pyramid of nested
callbacks, or you can use promises to untangle that mess.

Read more at https://github.com/promises-aplus/promises-spec


Bugs
----------------------

- DELETE is not yet supported as a request type in the requests that comprise a job
- The settings for the job store are hardcoded to an open App Services app under my personal ccount.
- The server implementation is incomplete; no job control yet.
- The sleep time between jobs is not dependent upon the run time of a job or set of jobs. It should be.
- There's no companion UI to create job definitions or inquire their status.  Should be done in angularJS!
- Variable load generation is not implemented yet. In other words, there's no such thing as a load profile resource. Each job should be designated to run a given # of times per hour. Then the runner should divide that by 12 to get the number of runs every 5 minutes.
- Currently no way to set a variable X-Forwarded-For header.  There will be a way to allow a weighted-random selection of XFF.
