var AWS = require('aws-sdk');
var docs = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
var token = "uk4pWPlX1Q6LqelLK4b0q8QY";
var qs = require('querystring');
var req = require('request');

const encryptedSlackAuthToken = process.env['SLACK_APP_AUTH_TOKEN'];
let decryptedSlackAuthToken;

function getActivityDate() {
    var dateObj = new Date();
    var month = ('0' + (dateObj.getMonth() + 1)).slice(-2);
    var day = ('0' + dateObj.getDate()).slice(-2);
    var year = dateObj.getFullYear();
    var timestamp = month + "/" + day + "/" + year;
    return timestamp;
}

function processEvent(event, context, callback) {
    console.log(JSON.stringify(event, null, '  '));

    var inputParams = qs.parse(event.body);
    var requestToken = inputParams.token;
    var slackUserId = inputParams.user_id;

    if (requestToken != token) {
        console.error("Request token (" + requestToken + ") does not match expected token for Slack");
        context.fail("Invalid request token");
    }

    var slackValues = inputParams.text.split('%2C');
    slackValues = inputParams.text.split(',');

    var activityDate = new Date().toString();
    var contact = (slackValues[0] !== null ? slackValues[0].toString() : "").trim();
    var company = (slackValues[1] !== null ? slackValues[1].toString() : "").trim();
    var event =  (slackValues[2] !== null ? slackValues[2].toString() : "").trim();

    req.post("https://slack.com/api/users.profile.get", {
        auth: {
            bearer: decryptedSlackAuthToken
        },
        form: {
            token: decryptedSlackAuthToken,
            user: slackUserId,
            include_labels: false
        }
    }, function(error, response, body) {
        if(error){
            callback("SLACK PROFILE RETRIEVAL ERROR - " + error, null);
        } else {
            var slackInfo = JSON.parse(response.body);
            console.log('slack info', slackInfo);
            docs.put({
                TableName: process.env.ACTIVITIES_TABLE,
                Item : {
                    timestamp: "" + new Date().getTime().toString(),
                    userName: inputParams.user_name,
                    name: slackInfo.profile.real_name,
                    // level: slackInfo.profile.fields.Xf1M339XQX.value, // Level
                    // office: slackInfo.profile.fields.Xf1LTXNG6P.value, // Office
                    date: getActivityDate(),
                    contact: contact,
                    company: company,
                    event: event,
                    rawText: inputParams.text
                }
            }, function(err, data) {
                if (err) {
                    callback(err + " " + body.timestamp, null);
                }
                else {
                    var successMessage = {
                        "response_type": "in_channel",
                        "text": "*Fintastic!* Networking activity recorded." 
                            + "\n*Fin*: " + slackInfo.profile.real_name 
                            + "\n*Contact*: " + contact 
                            + "\n*Company*: " + company 
                            + "\n*Event*: " + event,
                    };
                    console.log('great success: ' + JSON.stringify(successMessage));
                    var response = {
                        statusCode: 200,
                        body: JSON.stringify(successMessage)
                    };
                    callback(null, response);
                }
            });
        }
    });
}

exports.handler = (event, context, callback) => {
    if (decryptedSlackAuthToken) {
        processEvent(event, context, callback);
    } else {
        // Decrypt code should run once and variables stored outside of the function
        // handler so that these are decrypted once per container
        const kms = new AWS.KMS();
        kms.decrypt({ CiphertextBlob: new Buffer(encryptedSlackAuthToken, 'base64') }, (err, data) => {
            if (err) {
                console.log('Decrypt error:', err);
                return callback(err);
            }
            decryptedSlackAuthToken = data.Plaintext.toString('ascii');
            processEvent(event, context, callback);
        });
    }
};