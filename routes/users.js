var express = require('express');
var bcrypt = require('bcrypt');
var router = express.Router();
var db = require('../data/db');

/*
  Send a 200 OK with success:true in the request body to the
  response argument provided.
  The caller of this function should return after calling
*/
var sendSuccessResponse = function(res) {
  res.status(200).json({
    success: true
  });
};

/*
  Send an error code with success:false and error message
  as provided in the arguments to the response argument provided.
  The caller of this function should return after calling
*/
var sendErrResponse = function(res, errcode, err) {
  res.status(errcode).json({
    success: false,
    err: err
  });
};

/*
  Given a plaintext password string, uses bcrypt to salt + hash the password
  The callback takes exactly one argument, which is populated by the bcrypt'ed
  password
*/
var encryptPassword = function(password, cb) {
  bcrypt.genSalt(10, function(err, salt) {
    bcrypt.hash(password, salt, function(err, hash) {
      cb(hash);
    });
  });
};

/*
  Given a password and bcrypt password hash, check if they are the same
  The callback takes exactly one argument, which is true if they are a match,
  and false otherwise
*/
var comparePassword = function(password, pwhash, cb) {
  bcrypt.compare(password, pwhash, function(err, pwmatch) {
    cb(pwmatch);
  });
};

/*
  For both login and create user, we want to send an error code if the user
  is logged in, or if the client did not provide a username and password
  This function returns true if an error code was sent; the caller should return
  immediately in this case
*/
var isLoggedInOrInvalidBody = function(req, res) {
  if (req.currentUser) {
    sendErrResponse(res, 403, 'There is already a user logged in.');
    return true;
  } else if (!(req.body.username && req.body.password)) {
    sendErrResponse(res, 400, 'Username or password not provided.');
    return true;
  }
  return false;
};

/*
  Assume the API is accessed via browser -- express-sessions module will
  handle cookie passing for server-side sessions. If we didn't have a browser
  handling cookies then we'd have to pass an API authentication token back
  to the user

  This function will check to see that the provided username-password combination is valid.
  For empty username or password, or if the combination is not correct, an error will be
  returned.

  An already-logged in user is not allowed to call the login API again; an attempt
  to do so will result in an error code 403.

  POST /users/login
  Request body:
    - username
    - password
  Response:
    - success: true if login succeeded; false otherwise
    - err: if success == false, the error message goes here
*/
router.post('/login', function(req, res) {
  if (isLoggedInOrInvalidBody(req, res)) {
    return;
  }
  var users = db.get('users');
  users.findOne({
    username: req.body.username
  }, function(err, user) {
    if (user) {
      comparePassword(req.body.password, user.pwhash, function(pwmatch) {
        if (pwmatch) {
          req.session.userId = user._id;
          sendSuccessResponse(res);
        } else {
          sendErrResponse(res, 403, 'Username or password invalid.');
        }
      });
    } else {
      sendErrResponse(res, 403, 'Username or password invalid.');
    }
  });
});

/*
  POST /users/logout
  Request body: empty
  Response:
    - success: true if logout succeeded; false otherwise
    - err: if success == false, the error message goes here
*/
router.post('/logout', function(req, res) {
  if (req.currentUser) {
    delete req.session.userId;
    sendSuccessResponse(res);
  } else {
    sendErrResponse(res, 403, 'There is no user currently logged in.');
  }
});

/*
  Create a new user in the system.

  All usernames in the system must be distinct. If a request arrives with a username that
  already exists, the response will be an error.

  This API endpoint may only be called without an existing user logged in. If an existing user
  is already logged in, it will result in an error code 403.

  Does NOT automatically log in the user.

  POST /users
  Request body:
    - username
    - password
  Response:
    - success: true if user creation succeeded; false otherwise
    - err: if success == false, the error message goes here
*/
router.post('/', function(req, res) {
  console.log(req.body);
  if (isLoggedInOrInvalidBody(req, res)) {
    return;
  }
  encryptPassword(req.body.password, function(pwhash) {
    var users = db.get('users');
    users.insert({
      username: req.body.username,
      pwhash: pwhash
    }, function(err, result) {
      if (err) {
        if (err.code && (err.code === 11000 || err.code === 11001)) {
          sendErrResponse(res, 400, 'That username is already taken!');
        } else {
          sendErrResponse(res, 400, 'An unknown DB error occurred.');
        }
        sendErrResponse(res, 400, err);
      } else {
        sendSuccessResponse(res);
      }
    });
  });
});

module.exports = router;