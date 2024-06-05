"use strict";
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const passportSocketIo = require("passport.socketio");
const cookieParser = require("cookie-parser");
const MongoStore = require('connect-mongo')(session);
const myDB = require("./connection");
const fccTesting = require("./freeCodeCamp/fcctesting.js");

const URI = process.env.MONGO_URI;
const store = new MongoStore({ url: URI });

const routes = require("./routes");

const app = express();

const http = require('http').createServer(app);
const io = require('socket.io')(http);

function onAuthorizeSuccess(data, accept) {
  console.log('successful connection to socket.io');

  accept(null, true);
}

function onAuthorizeFail(data, message, error, accept) {
  if (error) throw new Error(message);
  console.log('failed connection to socket.io:', message);
  accept(null, false);
}


app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false },
    key: 'express.sid',
    store: store,
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.set("view engine", "pug");
app.set("views", "./views/pug");

fccTesting(app); //For FCC testing purposes
app.use("/public", express.static(process.cwd() + "/public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

io.use(
  passportSocketIo.authorize({
    cookieParser: cookieParser,
    key: 'express.sid',
    secret: process.env.SESSION_SECRET,
    store: store,
    success: onAuthorizeSuccess,
    fail: onAuthorizeFail
  })
);

myDB(async (client) => {
  const myDataBase = await client.db("database").collection("users");
  routes(app, myDataBase);
  let currentUsers = 0;
  io.on('connection', socket => {
    console.log('A user has connected:', socket.request.user.username);
    ++currentUsers;
    io.emit('user', {
      username: socket.request.user.username,
      currentUsers,
      connected: true,
    });
    socket.on('chat message', (msg) => {
      io.emit('chat message', {
        username: socket.request.user.username,
        message: msg
      });
    });
    socket.on('disconnect', () => {
      /*anything you want to do on disconnect*/
      --currentUsers;
      io.emit('user count', currentUsers);
      console.log('A user has disconnected');
    });
  });
}).catch((e) => {
  app.route("/").get((req, res) => {
    res.render("index", { title: e, message: "Unable to connect to database" });
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log("Listening on port " + PORT);
});


