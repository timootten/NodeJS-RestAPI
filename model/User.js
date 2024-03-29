var { mongoose, Argon2 } = require('../core');
var Response = require('../core/Response');
require('mongoose-double')(mongoose);
require('mongoose-long')(mongoose);
const Schema = mongoose.Schema;

const schema = new Schema ({
        _id: { type: String, default: () => generateUUID() },
        supportid: { type: String, default: () => generateSupportID() },
        username: { type: String, required: true, unique: true },
        confirmed: { type: Boolean, required: false, default: false },
        blocked: { type: Boolean, required: false, default: false },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: false },
        created: { type: Schema.Types.Long, required: false, default: () => new Date().getTime() },
        last_login: { type: Schema.Types.Long, required: false, default: () => new Date().getTime() },
        role: { type: String, required: false, default: "Customer" },
        provider: { type: String, required: false, default: "E-Mail" },
        balance: { type: Schema.Types.Double, default: 0 },
        address: { type: Object, required: false, default: {} },
        notes: { type: String, required: false, default: '' },
        settings: { type: Object, required: false, default: { language: "de" } },
});

schema.pre('save', async function(next) {
        var user = this;
        if(user.password)
                user.password = await Argon2.hash(user.password);
        user.email = user.email;
        next();
});

schema.methods.loginUser = async function(password, callback) {
        if(await Argon2.verify(this.password, password)) {
                this.password = undefined;
                callback(this);
        } else {
                callback(false);
        };
}

schema.methods.resetPassword = async function(callback) {
        var user = this;
        const password = generatePassword();
        if(user.password)
                user.password = password;
        user.save().then();
        callback(password);
}

function generateSupportID() {
        var supportID = "";
        for (var i = 8; i > 0; i--) {
                supportID += Math.floor(Math.random() * 10);
                if(i == 5)
                        supportID += "-";
        }
        return supportID;
}

function generatePassword() {
               const Charecters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        let Password = "";
        for (var i = 0, n = Charecters.length; i < 12; ++i) { Password += Charecters.charAt(Math.floor(Math.random() * n)); }
        return Password;
}

function generateUUID(){
        var dt = new Date().getTime();
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = (dt + Math.random()*16)%16 | 0;
            dt = Math.floor(dt/16);
            return (c=='x' ? r :(r&0x3|0x8)).toString(16);
        });
        return uuid;
}


module.exports = mongoose.model('User', schema);