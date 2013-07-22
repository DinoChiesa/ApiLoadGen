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
  - fixup the request references

This last step is sort of a wart on the data model and one I think I need to fix. For now, this is how it works. 

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
      "iterations": "1",
      "requestImpls": [
        {
          "requestRef": "fill in later"
          "delayBefore": "0",
          "responseExtracts": [
            {
              "description": "extract the access token",
              "fn": "function(obj) {return obj.access_token;}",
              "valueRef": "oauth_bearer_token"
            }
          ]
        }
      ]
    }


Add 1 or more sequences. 
And then add requests, like this:

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
        "password": "JournalisticGrievances"
      }
    }


You then get a request id in response. At this point you need to fixup the reference in the requestImpl field of the sequence, with a partial PUT update. 

`PUT /jobs/{job-id}/includes/{sequence-id}`

with this payload: 

      "requestImpls": [
        {
          "requestRef": "{request-id}"
        }
       ]






