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
- Not tested for use on server
- The sleep time is not dependent upon the run time
- execution of multiple jobs is done serially.
