require("dotenv").config();
var User = require('../model/User');
const ObjectToCSV = require('object-to-csv');
var { Google, JWT, Mail, FS, Argon2 } = require('../core');

var Default_Mail = "";
FS.readFile("./templates/mail/Default.html", (error, data) => {
    if(error) {
        throw error;
    }
    Default_Mail = data.toString();
});

// OAuth2 from Google
const oauth2Client = new Google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URL
);

exports.getGoogleURL = function(req) {
    return new Promise(function(resolve, reject) {
        const url = oauth2Client.generateAuthUrl({
            access_type: 'online',
            scope: [ 'email', 'profile', 'openid' ],
        });
        if(url)
            resolve({ url: url })
        else
            reject({ message: "The url could not be created" })
    });
}

exports.getGoogleCallback = function(req) {
    return new Promise(function(resolve, reject) {
        if(req.query.code == null) reject({ messsage: "No query input \"code\" was found!" })
        oauth2Client.getToken(req.query.code).then((result) => {
            oauth2Client.setCredentials(result.tokens);
            Google.oauth2("v2").userinfo.get({
                auth: oauth2Client,
            }).then(result => {
                const data = result.data;
                User.findOne({$or: [{ "email" : { $regex : new RegExp(`^${data.email}$`, 'i') } }, { "username" : { $regex : new RegExp(`^${data.name}$`, 'i') } }]})
                .then(result => {
                    if(!result) {
                        new User({ username: data.name, email: data.email, provider: "Google", confirmed: data.verified_email, settings: { language: data.locale } }).save()
                        .then(result => {
                            result.password = undefined;
                            const token = JWT.sign({
                                uuid: result._id,
                                email: result.email,
                                role: result.role,
                            }, process.env.JWT_SECRET, { expiresIn: '2h' });
                            resolve({ user: result, token: token })
                        })
                        .catch(error => {
                            console.log(error) 
                            reject(error)
                        });

                    } else {
                        if(result.email.toUpperCase() === data.email.toUpperCase()) {
                            req.user = result;
                            if(result.provider == "E-Mail") {
                                reject({ message: "Deine E-Mail wurde bereits verwendet" });
                                return;
                            }
                        } else {
                            reject({ message: "Dieser Nutzername wird bereits verwendet" });
                            return;
                        }
                        User.updateOne({ email: data.email }, { last_login: new Date().getTime(), confirmed: data.verified_email }).then();
                        result.password = undefined;
                        const token = JWT.sign({
                            uuid: result._id,
                            email: result.email,
                            role: result.role,
                        }, process.env.JWT_SECRET, { expiresIn: '2h' });
                        resolve({ user: result, token: token })
                    }
                });
                

            }).catch(error => reject(error))
        }).catch(error => reject(error));
    });
}

exports.loginUser = function(req) {
    return new Promise(function(resolve, reject) {
        if(!(req.body.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email))) reject({ message: "Du musst eine gültige E-Mail angeben"});
        if(!(req.body.password && req.body.password.length >= 8)) reject({ message: "Du musst ein Passwort mit mindestens 8 Zeichen angeben"});
        User.findOne({ "email" : { $regex : new RegExp(`^${req.body.email}$`, 'i') } }).then(user => {
            req.user = user;
            if(user.provider != "E-Mail") {
                reject({ message: "Du hast dich über " + user.provider + " angemeldet" });
                return;
            }
            if(!user.confirmed) {
                reject({ message: "Du musst erst deine E-Mail Adresse bestätigen" });
            }
            user.loginUser(req.body.password, function(result) {
                if(result) {
                    const token = JWT.sign({
                        uuid: result._id,
                        email: result.email,
                        role: result.role,
                    }, process.env.JWT_SECRET, { expiresIn: '2h' });
                    resolve({ user: result, token: token })
                } else {
                    reject({ message: "Die Passwörter stimmten nicht überein" })
                }
            });
        }).catch(error => {
            reject({ message: "E-Mail wurde nicht gefunden" })
        });
    });
}

exports.registerUser = function(req) {
    return new Promise(function(resolve, reject) {
        if(!(req.body.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email))) reject({ message: "Du musst eine gültige E-Mail angeben"});
        if(!(req.body.password && req.body.password.length >= 8)) reject({ message: "Du musst ein Passwort mit mindestens 8 Zeichen angeben"});
        if(!(req.body.username && req.body.username.length >= 4 && req.body.username.length <= 16)) reject({ message: "Du musst einen Nutzernamen mit mindestens 4 und maximal 16 Zeichen angeben"});
        User.findOne({$or: [{ "email" : { $regex : new RegExp(`^${req.body.email}$`, 'i') } }, { "username" : { $regex : new RegExp(`^${req.body.username}$`, 'i') } }]})
        .then(result => {
            if(result) {
                if(result.email.toUpperCase() === req.body.email.toUpperCase()) {
                    req.user = result;
                    if(result.provider == "E-Mail") {
                        reject({ message: "Deine E-Mail wurde bereits verwendet" });
                        return;
                    } else {
                        reject({ message: "Du hast dich über " + result.provider + " angemeldet" });
                        return;
                    }
                } else {
                    reject({ message: "Dieser Nutzername wird bereits verwendet" });
                    return;
                }
            }
            new User({ username: req.body.username, email: req.body.email, password: req.body.password }).save()
            .then(result => {
                result.password = undefined;

                resolve({user: result, message: "Dein Account wurde erfolgreich erstellt. Du musst nun deine E-Mail bestätigen"});

                const token = JWT.sign({
                    uuid: result._id,
                    confirm: true
                }, process.env.JWT_SECRET, { expiresIn: '1d' });

                var mail = Default_Mail
                    .replace(/%link%/g, 'http://localhost:3000/v1/auth/confirm/' + token)
                    .replace(/%title%/g, 'Account Bestätigen')
                    .replace(/%titlemessage%/g, 'Du hast es fast geschafft, ' + result.username +  '!')
                    .replace(/%message%/g, 'Du hast erfolgreich ein Konto erstellt. Um es zu aktivieren, klicke bitte unten, um deine E-Mail Adresse zu verifizieren.')
                    .replace(/%hostname%/g, process.env.WEB_HOST);


                const message = {
                    from: process.env.MAIL_NAME +' <' + process.env.MAIL_FROM + '>',
                    to: req.body.email,
                    subject: process.env.MAIL_NAME + ' - E-Mail verifizieren',
                    attachment: [
                        { data: mail, alternative: true }
                    ]
                };

                Mail.send(message);
                
            }).catch(error => {
                reject({ message: error });
                console.log(error);
            }); 
        });
    });
}

exports.confirmUser = function(req) {
    return new Promise(function(resolve, reject) {
        const uuid = JWT.verify(req.params.token, process.env.JWT_SECRET).uuid;
        User.findByIdAndUpdate(uuid, { confirmed: true }).then(user => {
            req.user = user;
            resolve({ message: "Dein Account wurde erfolgreich verifiziert" });
        }).catch(error => {
            reject({ message: error });
            console.log(error);
        });
    });
}

exports.resetPassword = function(req) {
    return new Promise(function(resolve, reject) {
        if(!(req.body.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email))) reject({ message: "Du musst eine gültige E-Mail angeben"});
        User.findOne({ "email" : { $regex : new RegExp(`^${req.body.email}$`, 'i') } }).then(user => {
            req.user = user;
            if(user.provider != "E-Mail") {
                reject({ message: "Du hast dich über " + user.provider + " angemeldet" });
                return;
            }
            user.resetPassword(function(result) {
                resolve({ message: "Dir wurde eine E-Mail mit deinem neuen Passwort geschickt" })
                
                var mail = Default_Mail
                    .replace(/%link%/g, '')
                    .replace(/%title%/g, result)
                    .replace(/%titlemessage%/g, 'Du hast ein neues Passwort angefordert.')
                    .replace(/%message%/g, 'Unten steht dein neues Passwort.')
                    .replace(/%hostname%/g, process.env.WEB_HOST);


                const message = {
                    from: process.env.MAIL_NAME +' <' + process.env.MAIL_FROM + '>',
                    to: req.body.email,
                    subject: process.env.MAIL_NAME + ' - Passwort zurücksetzen',
                    attachment: [
                        { data: mail, alternative: true }
                    ]
                };

                Mail.send(message);
            });
        }).catch(error => {
            reject({ message: "E-Mail wurde nicht gefunden" })
        });
    });
}

exports.getProfile = function(req) {
    return new Promise(function(resolve, reject) {
        User.findOne({ _id: req.user.uuid })
        .then(result => {
            result.password = undefined;
            resolve({ result })
        })
        .catch(error => reject({ message: error }));
    });
}

exports.setProfile = function(req) {
    return new Promise(async function(resolve, reject) {
        var update = {};
        if(req.body.settings)
            update.settings = req.body.settings;
        if(req.body.address)
            update.address = req.body.address;
        if(req.body.password)
            update.password = await Argon2.hash(req.body.password);
        User.findByIdAndUpdate(req.user.uuid, update).then(user => {
            req.user = user;
            resolve({ message: "Du hast dein Profil erfolgreich aktualisiert" });
        }).catch(error => {
            reject({ message: error });
            console.log(error);
        });
    });
}

exports.sendProfileInfo = function(req) {
    return new Promise(function(resolve, reject) {
        User.findOne({ _id: req.user.uuid })
        .then(result => {
            result.password = undefined;
            try {
                let data = [
                    { 
                      'make': 'Ford',
                      'model': 'Mustang',
                      'new': true
                    },
                ];

                //3. Set up CSV
                let otc = new ObjectToCSV(data);
                
                //4. Get CSV
                let csv = otc.getCSV();
                console.log(otc);
              } catch (err) {
                console.error(err);
              }
            resolve("dd")
        })
        .catch(error => reject({ message: error }));
    });
}