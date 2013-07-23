Creating a Job
==========

The resource model is

    /jobs/{job-id}
    /jobs/{job-id}/includes/
    /jobs/{job-id}/includes/{sequence-id}
    /jobs/{job-id}/includes/{sequence-id}/references
    /jobs/{job-id}/includes/{sequence-id}/references/{request-id}


To fully create a complete job definition you must:
  - create the basic job
  - add sequences to the job
  - add requests to each sequence



In more detail:
----------------------

Create a job like this:

`POST /jobs`

with this as a payload

    {
      "type": "job",
      "defaultProperties": {
        "scheme": "https",
        "host": "cheeso-test.apigee.net",
        "headers": {
          "Accept": "application/json"
        }
      },
      "description": "Whatever you like here"
    }

In the response you will get back a uuid. This identifies the job.


Add Sequences to a job like this:

`POST /jobs/{job-id}/includes`

with this as a payload

    {
      "type": "sequence",
      "name": "seqLogin",
      "description": "login",
      "iterations": "1"
    }

Add 1 or more sequences, and you get a sequence id for each one.
Then add 1 or more requests to each sequence, like this:

`POST /jobs/{job-id}/includes/{sequence-id}/references`

    {
      "type": "request",
      "name": "login",
      "headers": {
        "content-type": "application/json"
      },
      "method": "post",
      "pathSuffix": "/v1/todolist/token",
      "payload": {
        "grant_type": "password",
        "username": "Himself",
        "password": "HappinessPervades"
      },
      "delayBefore": "0",
      "extracts": [
        {
          "description": "extract the access token",
          "fn": "function(obj) {return obj.access_token;}",
          "valueRef": "oauth_bearer_token"
        }
      ]
    }

The "extracts" property defines a post-request step that can extract information from the payload or response headers. The fn property of that object should be the text source of a compilable JavaScript function. The valueRef contains the name of the reference variable to hold the extracted value.

This then can be referenced later in replacement templates for inputs to subsequent requests.