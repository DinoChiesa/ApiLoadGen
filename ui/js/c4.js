/*global log: false */

log.write('c4.js');

var html5AppId = '3C4ECBD1-7CC2-4A1B-B90B-6B4AB000A459',
    //ugBaseUrl = 'https://api.usergrid.com/dino/loadgen1',
    //jobsUrl = ugBaseUrl + '/jobs',
    loadgenUrl = 'http://lvh.me:8001';
    jobsUrl = loadgenUrl + '/jobs';


log.write('loadgenUrl: ' + loadgenUrl);

function Job(name, desc, defaultProps) {
  return {
    type        : "job",
    name        : name,
    description : desc,
    defaultProperties: defaultProps
  };
}

function MainController ($scope, $http, $dialog, $q /*, $httpProvider , $compile */ ) {
  var dialogModel = {}, reUrl = new RegExp('https?://[^/]+(/.*)$'),
      httpConfig, initialContext = {},
      token, org, app;

  $scope.sortKey = 'created';
  $scope.sortReverse = false;
  $scope.jobRecords = [];
  $scope.securityContext = {};
  $scope.showDetails = [];

  $scope.loginRegisterDialogOpts = {
    backdrop: true,
    keyboard: true,
    backdropClick: false,
    templateUrl: 'views/login-register-dialog.htm',
    controller: 'LoginRegisterDialogController',
    // resolve is used to inject data into the controller for the dialog.
    resolve: {
      dialogModel: function() { return angular.copy(dialogModel); },
      wantIdentity: function() { return true; },
      title: function() { return "unkown"; }}
  };


  $scope.initialContextDialogOpts = {
    backdrop: true,
    keyboard: true,
    backdropClick: false,
    templateUrl: 'views/initial-context-dialog.htm',
    controller: 'InitialContextDialogController',
    // resolve is used to inject data into the controller for the dialog.
    resolve: {
      initialContext: function() { return angular.copy(initialContext); },
      title: function() { return 'Initial Context'; }
    }
  };


  log.write('MainController');
  // check for existing, working token
  org = window.localStorage.getItem(html5AppId + '.org');
  app = window.localStorage.getItem(html5AppId + '.app');
  token = window.localStorage.getItem(html5AppId + '.bearerToken');
  if ( ! token) {
    log.write('C4 no cached OAuth token.');
    $scope.securityContext.checked = true;
  }
  else if ( ! org || !app ) {
    log.write('C4 no cached org and app.');
    $scope.securityContext.checked = true;
  }
  else {
    // verify that the token is valid, not expired
    log.write('C4 org(' + org + ') app(' + app + ') token(' + token + ')');
    // Since the loadgen server is a pass-through, we need to tell
    // it which org/app the token applies to.
    httpConfig = { headers:{ 'Authorization': 'Bearer ' + token,
                             'Accept': 'application/json',
                             'X-AppSvcs': org + ':' + app
                           } };
    $http.get(loadgenUrl + '/users/me', httpConfig)
      .success(function ( response ) {
        // success implies the token is valid
        $scope.securityContext = { access_token : token, user: response.entities[0]};
        log.write('OAuth token: ' + $scope.securityContext.access_token);
        log.write('user uuid: ' + $scope.securityContext.user.uuid);
        $http.defaults.headers.common.Authorization = 'Bearer ' + $scope.securityContext.access_token;
        $http.defaults.headers.common['x-appsvcs'] = org + ':' + app;
        initialRetrieve();
      })
      .error(function(responseBody, code, headers, config) {
        // in case of error, the token is probably stale.
        log.write('OAuth token validation failed');
        log.write('data: ' + JSON.stringify(responseBody, null, 2));
        log.write('status: ' + JSON.stringify(code, null, 2));
        log.write('headers: ' + JSON.stringify(headers, null, 2));
        window.localStorage.removeItem(html5AppId + '.bearerToken');
        $scope.securityContext.checked = true;
      });
  }

  $scope.openRegisterDialog = function() {
    dialogModel = {};
    $scope.loginRegisterDialogOpts.resolve.title = function() { return "Register"; };
    $scope.loginRegisterDialogOpts.resolve.wantIdentity = function() { return true; };
    var d = $dialog.dialog($scope.loginRegisterDialogOpts);
    d.open().then(function(result){
      if(result) {
        register(result);
      }
    });
  };

  $scope.openLoginDialog = function(keepErrorMsg) {
    if ( ! keepErrorMsg && dialogModel.errorMessage) { delete dialogModel.errorMessage; }
    dialogModel.org = org;
    dialogModel.app = app;
    $scope.loginRegisterDialogOpts.resolve.title = function() { return 'Login'; };
    $scope.loginRegisterDialogOpts.resolve.wantIdentity = function() { return false; };
    var d = $dialog.dialog($scope.loginRegisterDialogOpts);
    d.open().then(function(result){
      if(result) {
        login(result, initialRetrieve);
      }
    });
  };

  $scope.toggleJobStatus = function(item, $event) {
    if (item.status == 'running') {
      $scope.stopJob(item, $event);
    }
    else {
      $scope.openInitialContextDialog(item, $event);
    }
  };

  $scope.openInitialContextDialog = function(item, $event) {
    $scope.initialContextDialogOpts.resolve.title = function() {
      return 'Initial Context: ' + item.name;
    };
    var d = $dialog.dialog($scope.initialContextDialogOpts);
    d.open().then(function(result){
      if(result && result.payload) {
        $scope.startJob(item, result.payload);
      }
    });
  };

  $scope.startJob = function (job, payload) {
    //   POST /jobs/{job-id}?action=start
    if ( ! payload) { payload = {}; }
    $http.post(loadgenUrl + '/jobs/' + job.uuid + '?action=start', payload)
      .success(function(data) {
        log.write('start: ' + JSON.stringify(data));
        job.status = 'running';
      })
      .error(function(data, status, headers, config) {
        log.write('start failed...' + JSON.stringify(data));
      });
  };

  $scope.stopJob = function (job, $event) {
    //   POST /jobs/{job-id}?action=stop
    var url = loadgenUrl + '/jobs/' + job.uuid + '?action=stop';
    $http.post(url)
      .success(function(data) {
        log.write('stop: ' + JSON.stringify(data));
        job.status = 'stopped';
      })
      .error(function(data, status, headers, config) {
        log.write('stop failed...' + JSON.stringify(data));
        if (data.message == "that job is not currently running") {
          job.status = 'stopped';
        }
      });
  };

  $scope.getJobCssClass = function (job) {
    if (job.status === 'running') { return 'icon-stop';}
    return 'icon-play';
  };

  $scope.logout = function() {
    log.write('signing out user ' + $scope.securityContext.user.uuid);
    delete $http.defaults.headers.common.Authorization;
    window.localStorage.removeItem(html5AppId + '.bearerToken');
    $scope.jobRecords = [];
    $scope.securityContext = { checked : true }; // checked and not authenticated
  };



  // see http://docs.angularjs.org/api/ng.$http
  // after login:
  // $httpProvider.defaults.headers.common['Authorization'] = 'Bearer ' + access_token;

  function login(creds, success) {
    // curl -X POST -i -H "Content-Type: application/json"
    //     "https://api.usergrid.com/my-org/my-app/token"
    //     -d '{"grant_type":"password","username":"john.doe","password":"testpw"}'

    // success response:
    // {
    //   "access_token": "5wuGd-eeee-yyyy",
    //   "expires_in": 3600,
    //   "user": {
    //     "uuid": "6941ef6d-0dd0-4040-881d-c7abf5f339cc",
    //     "type": "user",
    //     "name": "Firstname Lastname",
    //     "created": 1372287618225,
    //     "modified": 1372287618225,
    //     "username": "Himself",
    //     "email": "person@example.com",
    //     "activated": true,
    //     "picture": "http://www.gravatar.com/avatar/d5e3ed864e42e13c54a427bd230dcf3d"
    //   }
    // }

    // subsequently, use this in http requests:
    // Authorization: Bearer {access_token}
    var loginPayload = { 'grant_type': 'password', username: creds.username, password: creds.password},
        loginHttpConfig = { headers:{ 'Content-Type': 'application/json',
                                      'Accept': 'application/json',
                                      'x-appsvcs': creds.org + ':' + creds.app }};

    // TODO: proxy the app services login from the loadgen server

    $http.post(loadgenUrl + '/token', loginPayload, loginHttpConfig)

      .success(function (response) {
        var token = response.access_token;
        $scope.securityContext = response;
        $scope.securityContext.checked = true;
        log.write('OAuth token: ' + token);
        window.localStorage.setItem(html5AppId + '.bearerToken', token);
        window.localStorage.setItem(html5AppId + '.org', creds.org);
        window.localStorage.setItem(html5AppId + '.app', creds.app);
        $http.defaults.headers.common.Authorization = 'Bearer ' + token;
        // necessary?
        httpConfig = { headers:{ 'Authorization': 'Bearer ' + token, 'Accept': 'application/json'} };
        org = creds.org;
        app = creds.app;
        if (dialogModel.errorMessage) { delete dialogModel.errorMessage; }
        creds.password = null;
        success();
      })
      .error(function(data, status, headers, config) {
        log.write('login failed');
        if (data && data.error_description) {
          dialogModel.errorMessage = data.error_description;
        }
        $scope.securityContext.checked = true;
        dialogModel.username = creds.username;
        dialogModel.org = creds.org;
        dialogModel.app = creds.app;
        // retry the login
        $scope.openLoginDialog(true);
      });
  }


  function register(creds) {
    // curl -X POST -i -H "Content-Type: application/json"
    //     "https://api.usergrid.com/my-org/my-app/users"
    //     -d '{"username":"john.doe","password":"testpw"}'

    // success response:
    // {
    //   "action" : "post",
    //   "application" : "00e1e88a-8610-11e2-8abc-02e81ac5a17b",
    //   "params" : { },
    //   "path" : "/users",
    //   "uri" : "http://api.usergrid.com/dino/todolist/users",
    //   "entities" : [ {
    //     "uuid" : "e23197ea-e02c-11e2-8f94-4548b396870f",
    //     "type" : "user",
    //     "created" : 1372449415262,
    //     "modified" : 1372449415262,
    //     "username" : "Schlotsky",
    //     "activated" : true,
    //     ...

    // subsequently, can login with those credentials.
    var registerPayload = { username: creds.username, password: creds.password, email: creds.email, name: creds.name },
        localHttpConfig = { headers:{ 'Content-Type': 'application/json', 'Accept': 'application/json'} };

    $http.post(loadgenUrl + '/users', registerPayload, localHttpConfig)
      .success(function (response) {
        var user = response.entities[0];
        if (user && user.activated) {
          log.write('successfully created a new user: ' + user.uuid);
          login(creds, initialRetrieve);
        }
      })
      .error(function(data, status, headers, config) {
        log.write('registration failed');
        if (data && data.error_description) {
          dialogModel.errorMessage = data.error_description;
        }
        dialogModel.username = creds.username;
        // retry the registration
        $scope.openRegisterDialog();
      });
  }

  function shortUrl(url) {
    var m = reUrl.exec(url);
    if ( ! m) {return '??';}
    return m[1];
  }

  // function jobGetter(job) {
  //   return function(){
  //     return $http
  //       .get(ugBaseUrl + job.metadata.connections.includes);
  //   };
  // }
  //
  // function requestGetter(seq) {
  //   return function(){
  //     return $http
  //       .get(ugBaseUrl + seq.metadata.connections.references);
  //   };
  // }
  //
  // function requestAppender(seq) {
  //   return function(resp){
  //     log.write('requests: ' + JSON.stringify(resp.data.entities, null, 2));
  //     seq.requests = resp.data.entities;
  //     return true;
  //   };
  // }
  //
  // function jobAmender(job) {
  //   return function(resp) {
  //     var seq, p, i, L;
  //     log.write('sequences: ' + JSON.stringify(resp.data.entities, null, 2));
  //     job.sequences = resp.data.entities;
  //     p = $q.when(true);
  //     for (i=0, L=job.sequences.length; i<L; i++) {
  //       seq = job.sequences[i];
  //       p = p.then(requestGetter(seq))
  //         .then(requestAppender(seq));
  //     }
  //     return p;
  //   };
  // }

  function trackFailure(e) {
    log.write(JSON.stringify(e, null, 2));
  }

  function initialRetrieve() {
    var url = loadgenUrl + '/jobs' + '?limit=100';
    log.write('get items from Loadgen... ' + url);

    //httpConfig = { headers:{ 'Authorization': 'Bearer ' + token, 'Accept': 'application/json'} };

    $http.get(url)
      .success(function(data, statusCode, hdrsGetterFn, more){
        log.write('got ' + data.length + ' jobs');
        $scope.jobRecords = data;
      })
      .error(function(response, code /*, headers, config */) {
        log.write('failed to get items from UG: ' + JSON.stringify(response,null,2) + ' ' + code);
      });
  }


  $scope.addJob = function () {
    // AFAIK, nobody calls this. There is no UI for this.
    var job = new Job($scope.newJobName, $scope.newJobDescrip, {});
    log.write('New job: ' + $scope.newJobName);
    $http.post(jobsUrl, job)
      .success(function(newJob){
        log.write('New job created:' + JSON.stringify(newJob));
        $scope.jobRecords.push( newJob );
        rec.uuid = newJob.uuid;
        $scope.newJobName = '';
        $scope.newJobDescrip = '';
      })
      .error(function(data, status, headers, config) {
        log.write('creation failed...' + JSON.stringify(data));
      });
    $scope.newJobName = '';
  };


  $scope.itemNormalizationFunction = function(item) {
    var val = item[$scope.sortKey];
    if ($scope.sortKey === 'created' || $scope.sortKey === 'conducted') {
      if (isNaN(val)) { return 0;}
      return val;
    }
    return val;
  };

  $scope.setSort = function($event) {
    var oldKey = $scope.sortKey,
        header = $event.currentTarget.innerHTML,
        fakeItem = new Job('this is fake', 'and this', {});
    if (fakeItem.hasOwnProperty(header.toLowerCase())) {
      $scope.sortKey = header.toLowerCase();
    }
    else if (header === 'Desc'){
      $scope.sortKey = 'description';
    }
    else if (header === 'id'){
      $scope.sortKey = 'uuid';
    }

    if (oldKey === $scope.sortKey) {
      $scope.sortReverse = !$scope.sortReverse;
    }
    else {
      $scope.sortReverse = false;
    }
  };

  $scope.deleteItem = function(item) {
    var url = jobsUrl + '/' + item.uuid;
    log.write('delete item: ' + item.uuid);
    log.write('delete url: ' + url);
    $http.delete(url, httpConfig)
      .success(function(content) {
        log.write('deleted:' + JSON.stringify(content));
      })
      .error(function(data, status, headers, config) {
        log.write('Deletion failed...' + JSON.stringify(data));
      });
    $scope.jobRecords.splice($scope.jobRecords.indexOf(item),1);
  };

  $scope.toggleDetails = function(item, $event) {
    var ix = $scope.showDetails.indexOf(item.uuid);
    if (ix === -1) {
      // make the corresponding icon a minus (collapse)
      angular.element($event.target).addClass( 'icon-minus' );
      angular.element($event.target).removeClass( 'icon-plus' );
      $scope.showDetails.push(item.uuid);
    }
    else {
      // swap icon back to plus
      angular.element($event.target).addClass( 'icon-plus' );
      angular.element($event.target).removeClass( 'icon-minus' );
      $scope.showDetails.splice(ix, 1);
    }
  };

  $scope.wantDetails = function(item) {
    return ($scope.showDetails.indexOf(item.uuid) !== -1);
  };

  $scope.updateItemProp = function(value, previousValue, item, propName) {
    var url = jobsUrl + '/' + item.uuid;
    log.write('Item ' + propName + ': ' + item.uuid + ', ' + value);
    item[propName] = value;
    $http.put(url, item)
      .success(function( /* content */ ) {
        log.write('UG updated, ' + propName + ':' + item[propName]);
      })
      .error(function(data, status, headers, config) {
        log.write('Update failed...' + JSON.stringify(data));
      });
  };

  $scope.getTotalRecords = function () {
    return $scope.jobRecords.length;
  };
}


function LoginRegisterDialogController ($scope, dialog, dialogModel, title, wantIdentity) {
  $scope.dialogModel = dialogModel;
  $scope.title = title;
  $scope.wantIdentity = wantIdentity;
  $scope.cancel = function(){
    dialog.close();
  };
  $scope.login = function(result){
    dialog.close(result);
  };
}


function InitialContextDialogController ($scope, dialog, initialContext, title) {
  $scope.initialContext = initialContext;
  $scope.title = title;
  $scope.cancel = function(){
    dialog.close();
  };
  $scope.submit = function(result){
    if ( ! result ) {result = {payload:{}};}
    dialog.close(result);
  };
}

function JobEditorController ($scope, dialog, dialogModel, job) {
  $scope.dialogModel = dialogModel;
  $scope.job = job;
  $scope.cancel = function(){
    dialog.close();
  };
  $scope.save = function(modJob){
    dialog.close(modJob);
  };
}

function CollapseDemoController($scope) {
  $scope.isCollapsed = true;
  $scope.getButtonSymbol = function() {
    return ($scope.isCollapsed) ? '<' : '>';
  };
}
