const express = require('express');
const router = express.Router();
const passport = require('passport');
const crypto = require('crypto');
const async = require('async');
const nodemailer = require('nodemailer');
const bodyParser = require("body-parser")
const mongoose = require("mongoose");
//Requiring user model
const User = require('../models/usermodel');
const { countReset, timeStamp } = require('console');
const { strict } = require('assert');

mongoose.connect("mongodb://localhost:27017/linkManager", { useNewUrlParser: true, useUnifiedTopology: true });

const linksSchema = {
    link: String,
    des: String,
    course: String,
    date: String,
    dept: String,
    sem: Number,
    duration: String,
}

const Link = mongoose.model("Link", linksSchema);

const db = mongoose.connection;

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

// Checks if user is authenticated
function isAuthenticatedUser(req, res, next) {
    if(req.isAuthenticated()) {
        return next();
    }
    req.flash('error_msg', 'Please Login first to access this page.')
    res.redirect('/login');
}

//Get routes
router.get('/login', (req,res)=> {
    res.render('login');
});

router.get('/', (req, res) => {
    res.render('index');
})

router.post('/', (req, res) => {
    if (req.body.radio === "student") {
        res.redirect('student')
    }
    if (req.body.radio === "teacher") {
        res.render('login');
    }
});
router.get('/student', (req, res) => {
    Link.find({}, function (err, foundLinks) {
        res.render('student', { newLinks: foundLinks })
    });
});

router.post('/student', (req, res) => {
    var date = req.body.date;
    var course = req.body.course;
    if (date == "") {
        Link.find({"course": course }, (err, foundLinks) => {
            res.render('student', {newLinks: foundLinks})
        })
    }
    if (course == "") {
        Link.find({ "date": date}, (err, foundLinks) => {
            res.render('student', {newLinks: foundLinks})
        })
    }
    Link.find({ "date": date, "course": course }, (err, foundLinks) => {
        res.render('student', {newLinks: foundLinks})
    })
});

// var linksarray = [{
//     "link" : "https:youtube.com",
//     "des": "this is your favorite web",
//     "course": "Networking",
//     "date": "2020-12-26",
//     "dept": "Computer Science",
//     "sem": 8
// }]


router.post('/dashboard', (req, res) => {
    var link = req.body.link;
    var des = req.body.description;
    var course = req.body.course;
    var date = req.body.date;
    var dept = req.body.department;
    var sem = req.body.sem;
    var duration = req.body.duration;
    console.log(duration);
    //linksarray.push({ "link": link, "des": des, "course": course, "date": date, "dept": dept, "sem": sem });

    var data = {
        "link": link,
        "des": des,
        "course": course,
        "date": date,
        "dept": dept,
        "sem": sem,
        "duration": duration,
    }
    db.collection('links').insertOne(data, function (err, collection) {
        if (err) {
            throw err;
        }
        console.log("Record inserted successfully!");
    });
    Link.find({}, function (err, foundLinks) {
        res.render('dashboard', { newLinks: foundLinks });
    })
});
router.get('/dashboard', isAuthenticatedUser, (req, res) => {
    Link.find({}, function (err, foundLinks) {
        res.render('dashboard', { newLinks: foundLinks });
    })
    
    
});

router.get('/signup', (req, res) => {
    
    res.render('signup');
});



router.get('/logout', isAuthenticatedUser,(req, res)=> {
    req.logOut();
    req.flash('success_msg', 'You have been logged out.');
    res.redirect('/login');
});

router.get('/forgot', (req, res)=> {
    res.render('forgot');
});

router.get('/reset/:token', (req, res)=> {
    User.findOne({resetPasswordToken: req.params.token, resetPasswordExpires : {$gt : Date.now() } })
        .then(user => {
            if(!user) {
                req.flash('error_msg', 'Password reset token in invalid or has been expired.');
                res.redirect('/forgot');
            }

            res.render('newpassword', {token : req.params.token});
        })
        .catch(err => {
            req.flash('error_msg', 'ERROR: '+err);
            res.redirect('/forgot');
        });
});

router.get('/password/change', isAuthenticatedUser, (req, res)=> {
    res.render('changepassword');
});

//POST routes
router.post('/login', passport.authenticate('local', {
    successRedirect : '/dashboard',
    failureRedirect : '/login',
    failureFlash: 'Invalid email or password. Try Again!!!'
}));


router.post('/signup', (req, res)=> {
    let {name, email, password} = req.body;

    let userData = {
        name : name,
        email :email
    };

    User.register(userData, password, (err, user)=> {
        if(err) {
            req.flash('error_msg', 'ERROR: '+err);
            res.redirect('/signup');
        }
        passport.authenticate('local') (req, res, ()=> {
            req.flash('success_msg', 'Account created successfully');
            res.redirect('/login');
        });
    });

});

router.post('/password/change', (req, res)=> {
    if(req.body.password !== req.body.confirmpassword) {
        req.flash('error_msg', "Password don't match. Type again!");
        return res.redirect('/password/change');
    }

    User.findOne({email : req.user.email})
        .then(user => {
            user.setPassword(req.body.password, err=>{
                user.save()
                    .then(user => {
                        req.flash('success_msg', 'Password changed successfully.');
                        res.redirect('/dashboard');
                    })
                    .catch(err => {
                        req.flash('error_msg', 'ERROR: '+err);
                        res.redirect('/password/change');
                    });
            });
        });
});

// Routes to handle forgot password
router.post('/forgot', (req, res, next)=> {
    let recoveryPassword = '';
    async.waterfall([
        (done) => {
            crypto.randomBytes(20, (err , buf) => {
                let token = buf.toString('hex');
                done(err, token);
            });
        },
        (token, done) => {
            User.findOne({email : req.body.email})
                .then(user => {
                    if(!user) {
                        req.flash('error_msg', 'User does not exist with this email.');
                        return res.redirect('/forgot');
                    }

                    user.resetPasswordToken = token;
                    user.resetPasswordExpires = Date.now() + 1800000; //   1/2 hours

                    user.save(err => {
                        done(err, token, user);
                    });
                })
                .catch(err => {
                    req.flash('error_msg', 'ERROR: '+err);
                    res.redirect('/forgot');
                })
        },
        (token, user) => {
            let smtpTransport = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user : process.env.GMAIL_EMAIL,
                    pass: process.env.GMAIL_PASSWORD
                }
            });

            let mailOptions = {
                to: user.email,
                from : 'Ghulam Abbas myapkforest@gmail.com',
                subject : 'Recovery Email from Auth Project',
                text : 'Please click the following link to recover your passoword: \n\n'+
                        'http://'+ req.headers.host +'/reset/'+token+'\n\n'+
                        'If you did not request this, please ignore this email.'
            };
            smtpTransport.sendMail(mailOptions, err=> {
                req.flash('success_msg', 'Email send with further instructions. Please check that.');
                res.redirect('/forgot');
            });
        }

    ], err => {
        if(err) res.redirect('/forgot');
    });
});

router.post('/reset/:token', (req, res)=>{
    async.waterfall([
        (done) => {
            User.findOne({resetPasswordToken: req.params.token, resetPasswordExpires : {$gt : Date.now() } })
                .then(user => {
                    if(!user) {
                        req.flash('error_msg', 'Password reset token in invalid or has been expired.');
                        res.redirect('/forgot');
                    }

                    if(req.body.password !== req.body.confirmpassword) {
                        req.flash('error_msg', "Password don't match.");
                        return res.redirect('/forgot');
                    }

                    user.setPassword(req.body.password, err => {
                        user.resetPasswordToken = undefined;
                        user.resetPasswordExpires = undefined;

                        user.save(err => {
                            req.logIn(user, err => {
                                done(err, user);
                            })
                        });
                    });
                })
                .catch(err => {
                    req.flash('error_msg', 'ERROR: '+err);
                    res.redirect('/forgot');
                });
        },
        (user) => {
            let smtpTransport = nodemailer.createTransport({
                service : 'Gmail',
                auth:{
                    user : process.env.GMAIL_EMAIL,
                    pass : process.env.GMAIL_PASSWORD
                }
            });

            let mailOptions = {
                to : user.email,
                from : 'Ghulam Abbas myapkforest@gmail.com',
                subject : 'Your password is changed',
                text: 'Hello, '+user.name+'\n\n'+
                      'This is the confirmation that the password for your account '+ user.email+' has been changed.'
            };

            smtpTransport.sendMail(mailOptions, err=>{
                req.flash('success_msg', 'Your password has been changed successfully.');
                res.redirect('/login');
            });
        }

    ], err => {
        res.redirect('/login');
    });
});

router.get('/addlink', (req, res)=> {
    res.render('addLink');
});

module.exports = router;