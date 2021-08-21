require("dotenv").config();
var { router, Response, AuthService, UsersService } = require('../core');

router.get('/google/url', async function(req, res) {
    AuthService.getGoogleURL(req)
    .then(function (response) {
        Response.successfully(response, res);
    })
    .catch(function (response) {
        Response.failed(response, res);
    });
});

router.get('/google/callback', async function(req, res) {
    AuthService.getGoogleCallback(req)
    .then(function (response) {
        Response.successfully(response, res);
    })
    .catch(function (response) {
        Response.failed(response, res);
    });
});

router.post('/login', async function(req, res) {
    AuthService.loginUser(req)
    .then(function (response) {
        response.message = "You have successfully logged in";
        Response.successfully(response, res);
    })
    .catch(function (response) {
        Response.failed(response, res);
    });
});

router.post('/register', async function(req, res) {
    AuthService.registerUser(req)
    .then(function (response) {
        response.message = "You have successfully registered";
        Response.successfully(response, res);
    })
    .catch(function (response) {
        Response.failed(response, res);
    });
});

router.get('/profile', async function(req, res) {
    AuthService.getProfile(req)
    .then(function (response) {
        Response.successfully(response, res);
    })
    .catch(function (response) {
        res.status(401);
        Response.failed(response, res);
    });
});

module.exports = router;