const express = require("express");
const escape = require("escape-html");
const { getLoggedInUserId } = require("../utils");
const db = require("../db");
const { plaidClient } = require(".././plaid");
const { syncTransactions } = require("./transactions");
const {getUserRecord, updateUserRecord}  = require(".././user_utils");
const {
  FIELD_ACCESS_TOKEN,
  FIELD_USER_ID,
  FIELD_USER_STATUS,
  FIELD_ITEM_ID,
} = require(".././constants");
const router = express.Router();

const WEBHOOK_URL =
  process.env.WEBHOOK_URL || "https://www.example.com/server/receive_webhook";


router.post("/create_link_token", async (req, res, next) => {
  try {
    
    // Part 1

    const currentUser = await getUserRecord();
    const userId = currentUser[FIELD_USER_ID];
    const createTokenResponse = await plaidClient.linkTokenCreate({
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

/**
 * Exchanges a public token for an access token. Then, fetches a bunch of
 * information about that item and stores it in our database
 */
router.post("/exchange_public_token", async (req, res, next) => {
  try {
    const userId = getLoggedInUserId(req);
    const publicToken = escape(req.body.publicToken);

    const tokenResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    const tokenData = tokenResponse.data;
    await db.addItem(tokenData.item_id, userId, tokenData.access_token);
    await populateBankName(tokenData.item_id, tokenData.access_token);
    await populateAccountNames(tokenData.access_token);

    //call sync right away to "activate" the sync webhookd
    await syncTransactions(tokenData.item_id);
    /* Placeholder code to show that something works! */
    // const identityResult = await plaidClient.identityGet({
    //   access_token: tokenData.access_token,
    // });
    // console.log(`Here's some info about the account holders:`);
    // console.dir(identityResult.data, { depth: null, colors: true });

    res.json({ status: "success" }); 
  } catch (error) {
    console.log(`Running into an error!`);
    next(error);
  }
});

const populateBankName = async (itemId, accessToken) => {
  try {
    const itemResponse = await plaidClient.itemGet({
      access_token: accessToken,
    });
    const institutionId = itemResponse.data.item.institution_id;
    if (institutionId == null) {
      return;
    }
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"],
    });
    const institutionName = institutionResponse.data.institution.name;
    await db.addBankNameForItem(itemId, institutionName);
  } catch (error) {
    console.log(`Ran into an error! ${error}`);
  }
};

const populateAccountNames = async (accessToken) => {
  try {
    const acctsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });
    const acctsData = acctsResponse.data;
    const itemId = acctsData.item.item_id;
    await Promise.all(
      acctsData.accounts.map(async (acct) => {
        await db.addAccount(acct.account_id, itemId, acct.name);
      })
    );
  } catch (error) {
    console.log(`Ran into an error! ${error}`);
  }
};

module.exports = router;
