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

These JS files are NodeJS scripts.  They also require some other
node modules, including: q, sleep, restify, assert, and fs.


Bugs
----------------------

- The README is lame
- The settings for the job store are hardcoded to an open App Services app under my personal ccount.
- Not tested for use on server
- The sleep time between jobs is not dependent upon the run time of a job or set of jobs. It should be.
- execution of multiple jobs is done serially.
- There's no companion UI to create job definitions
