var AWS = require('aws-sdk');
var docs = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
var token = "uk4pWPlX1Q6LqelLK4b0q8QY";
var qs = require('querystring');
var req = require('request');
var json2csv = require('json2csv');

const encryptedSlackAuthToken = process.env['SLACK_BOT_AUTH_TOKEN'];
let decryptedSlackAuthToken;

function getTimestamp() {
    var dateObj = new Date();
    var hour = ('0' + dateObj.getHours()).slice(-2);
    var minute = ('0' + dateObj.getMinutes()).slice(-2);
    var second = ('0' + dateObj.getSeconds()).slice(-2);
    var month = ('0' + (dateObj.getMonth() + 1)).slice(-2);
    var day = ('0' + dateObj.getDate()).slice(-2);
    var year = dateObj.getFullYear();
    var timestamp = year + month + day + hour + minute + second;
    return timestamp;
}

function sendSlashCommandResponse(callback) {
    var successMessage = {
        "text": "A CSV file will be sent to you momentarily..."
    };
    var response = {
        statusCode: 200,
        body: JSON.stringify(successMessage)
    };
    callback(null, response);
}

function processEvent(event, context, callback) {
    console.log(JSON.stringify(event, null, '  '));

    var inputParams = qs.parse(event.body);
    var timestamp = "" + new Date().getTime().toString();
    var requestToken = inputParams.token;
    var slackUserId = inputParams.user_id;

    if (requestToken != token) {
        console.error("Request token (" + requestToken + ") does not match exptected token for Slack");
        context.fail("Invalid request token");
    }

    sendSlashCommandResponse(callback);

    var slackValues = inputParams.text;

    var fields = ['date', 'contact', 'company', 'event', 'name', 'level', 'office'];
    var params = {
        TableName : process.env.ACTIVITIES_TABLE
    };

    docs.scan(params, function(err, data) {
        if (err) {
            console.log('ERROR RETRIEVING DYNAMODB DATA: ' + err);
        }
        else {
            var csv = json2csv({ data: data.Items, fields: fields });

            req.post("https://slack.com/api/files.upload", {
                auth: {
                    bearer: decryptedSlackAuthToken
                },
                form: {
                    token: decryptedSlackAuthToken,
                    content: csv,
                    filetype: "csv",
                    filename: "FeedTheFunnelData_" + getTimestamp() + ".csv",
                    title: "FeedTheFunnel Data",
                    initial_comment: "Here's the FeedTheFunnel data you requested :fintastic:",
                    channels: "@" + inputParams.user_name//"@slackbot"
                }
            }, function(error, response, body) {
                if(error){
                    console.log("SLACK FILE UPLOAD ERROR - " + error, null);
                } else {
                    console.log('slack file upload response', response);
                    console.log('great success', response);
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