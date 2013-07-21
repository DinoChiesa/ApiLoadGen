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


Job Control
----------------------

The NodeJS app is itself strictly an API server.  It presents a
simple interface to manage resources known as jobs, sequences,
and requests.

Jobs consist of a server name and scheme, a set of default http
headers to send with each request, 1..N "included" request
sequences, and a reference to a load-profile.  (FYI: All of the
job definition metadata is stored in App Services. In this
case, "includes" is an App Services entity relationship, so that
a GET on /org/app/jobs/{job-id}/includes/sequences will give all
the sequences.)  The load profile simply describes how many
requests to make in a given hour of the day.

A sequence consists of 1..M "request implementations", a desired
iteration count for th sequence (1..?), and a time to delay
between iterations.  The request implementations are a nested
object containing a reference to a request entity (==uuid), and a set of
extractions to perform on the response.

A request consiste of a descriptive name, an HTTP verb, a url
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


In addition, there are a few job control APIs:

* `POST /jobs/{job-id}?action=start`
   begin running the job. The job runs "forever".

* `POST /jobs/{job-id}?action=stop`
   stop running the job.



Status
----------------------

This is currently a proof of concept. There is no server-side
nodejs app just yet. I'm getting there.



Interesting Files
----------------------

* `retrieve1.js`
shows how to retrieve the "job model" from App Services


* `run3.js`
shows how to retrieve the all the stored jobs, and then run each one.




Notes
----------------------

The JS files here are NodeJS scripts.  They also require some other
node modules, including: q, sleep, restify, assert, and fs.  To run these sripts you may have to:

 `$ npm install q restify sleep`

in your local directory.


The q module implements promises, which is a framework for
managing ordered execution of asynchronous operations. When you
have a chain of asynch operations, like HTTP calls, and the
subsequent operation should be performed only after the prior op
completes, you can designed a giant pyramid of nested callbacks,
or you can use promises to untangle that mess.



Bugs
----------------------

- The README is incomplete
- DELETE is not yet supported as a request type
- The settings for the job store are hardcoded to an open App Services app under my personal ccount.
- No server implementation yet; no job control.
- The sleep time between jobs is not dependent upon the run time of a job or set of jobs. It should be.
- There's no companion UI to create job definitions or inquire their status.  Should be done in angularJS!
- Variable load generation is not implemented yet. Each job should be designated to run a given # of times per hour. Then the runner should divide that by 12 to get the number of runs every 5 minutes.
- Currently no way to set a variable X-Forwarded-For header.  There will be a way to allow a weighted-random selection of XFF.
