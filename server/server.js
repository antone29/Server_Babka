require("dotenv").config();
// const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const { getUserRecord, updateUserRecord } = require("./user_utils");
const {
  FIELD_ACCESS_TOKEN,
  FIELD_USER_ID,
  FIELD_USER_STATUS,
  FIELD_ITEM_ID,
} = require("./constants");
const APP_PORT = process.env.APP_PORT || 8000;

/**
 * Initialization!
 */

//from the tutorial online
const express = require('express');
const app = express();
app.use(express.json());
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const configuration = new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const client = new PlaidApi(configuration);
//end 





// Set up the server

// const app = express();
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("./public"));

const server = app.listen(APP_PORT, function () {
  console.log(`Server is up and running at http://localhost:${APP_PORT}/`);
});

const usersRouter = require("./routes/users");
const linkTokenRouter = require("./routes/tokens");
const bankRouter = require("./routes/banks");
const { router: transactionsRouter } = require("./routes/transactions");
const debugRouter = require("./routes/debug");
const { getWebhookServer } = require("./webhookServer");

app.use("/server/users", usersRouter);
app.use("/server/tokens", linkTokenRouter);
app.use("/server/banks", bankRouter);
app.use("/server/transactions", transactionsRouter);
app.use("/server/debug", debugRouter);


 /* Fetches some info about our user from our "database" and returns it to
 * the client. probably will remove this for actual user login 
 */
app.get("/server/get_user_info", async (req, res, next) => {
  try {
    const currentUser = await getUserRecord();
    console.log("currentUser", currentUser);
    res.json({
      userId: currentUser["userId"],
      userStatus: currentUser["userStatus"],
    });
  } catch (error) {
    next(error);
  }
});


app.post("/api/create_link_token", async (req, res, next) => {
  try {
    
    // Part 1

    const currentUser = await getUserRecord();
    const userId = currentUser[FIELD_USER_ID];
    const createTokenResponse = await client.linkTokenCreate({
      user: {
        client_user_id: userId,
      },
      client_name: "iOS Video Demo",
      country_codes: ["US"],
      language: "en",
      products: ["auth"],
      webhook: "https://sample-webhook-uri.com", 
      redirect_uri: "https://babkabudget.com/plaid/test",
      //this is where you put your server endpointk theres a tutorial on this
    });
    const data = createTokenResponse.data;
    console.log("createTokenResponse", data);
  
    
    res.json({ expiration: data.expiration, linkToken: data.link_token });
    
  } catch (error) {
    console.log(
      "Running into an error! Note that if you have an error when creating a " +
        "link token, it's frequently because you have the wrong client_id " +
        "or secret for the environment, or you forgot to copy over your " +
        ".env.template file to.env."
    );
    next(error);
  }
});

/* Add in some basic error handling so our server doesn't crash if we run into
 * an error.
 */
const errorHandler = function (err, req, res, next) {
  console.error(`Your error:`);
  console.error(err);
  if (err.response?.data != null) {
    res.status(500).send(err.response.data);
  } else {
    res.status(500).send({
      error_code: "OTHER_ERROR",
      error_message: "I got some other message on the server.",
    });
  }
};
app.use(errorHandler);

// Initialize our webhook server, too.
const webhookServer = getWebhookServer();
