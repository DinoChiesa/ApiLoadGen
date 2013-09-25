ApiLoadGen
==========

Other info... 


Less Interesting Files
----------------------------------

These were constructed during the R&D effort.  I may remove these later.

* `parseCitiesPop.js`  
  a one-time use program to parse the txt file containing the list of US cities and population from wikipedia, and populate App Services with that data. 

* `FileReader.js`  
  a line-by-line file reader for nodejs, used by parseCitiesPop.js

* `server3.js`  
  a simple REST nodejs server, similar to server4.js  above, but implemented with restify for the http client and server. Accepts APIs on the jobs under management. I'm no longer updating this module. 

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




Design Notes
----------------------

The server5.js file uses the q module for promises, which is a framework
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


