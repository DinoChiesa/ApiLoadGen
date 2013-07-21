ApiLoadGen
==========

Load Generator tool for API tests


Interesting Files
----------------------

retrieve1.js

shows how to retrieve the "job model" from App Services


run3.js

shows how to retrieve the job model and then run it.



Notes
----------------------

The JS files here are NodeJS scripts.  They also require some other
node modules, including: q, sleep, restify, assert, and fs.  To run these sripts you may have to:

   npm install q restify sleep

in your local directory.


The q module implements promises, which is a framework for
managing ordered execution of asynchronous operations. When you
have a chain of asynch operations, like HTTP calls, and the
subsequent operation should be performed only after the prior op
completes, you can designed a giant pyramid of nested callbacks,
or you can use promises to untangle that mess.




Bugs
----------------------

- The README is lame
- The settings for the job store are hardcoded to an open App Services app under my personal ccount.
- Not tested for use on server
- The sleep time between jobs is not dependent upon the run time of a job or set of jobs. It should be.
- execution of multiple jobs is done serially.
- There's no companion UI to create job definitions
- There's no variable load generation. Each job should be designated to run a given # of times per hour. Then the runner should divide that by 12 to get the number of runs every 5 minutes.
- Currently no way to set a variable X-Forwarded-For header.  There ought to be  way to allow a weighted-random selection of XFF.
