const AWS = require('aws-sdk');
const axios = require('axios')

const comprehend = new AWS.Comprehend({apiVersion: '2017-11-27'});

async function trackEvents(keys, events) {
  const body = JSON.stringify({
    keys: keys,
    events: events
  });

  const karteApiURL = `https://${process.env.KARTEApiHostname}/v2/track/event/write`
  const authorizationHeader = `Bearer ${process.env.KARTEAccessToken}`;

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Authorization': authorizationHeader
  };
  
  return await axios.post(karteApiURL,
    body, {
    headers,
  });
}


exports.handler = async (event, context) => {
  const content = JSON.parse(event.Records[0].Sns.Message).detail.content;
  const {answered_question, visitor_id} = content;
  let {languageCode} = content;
  // console.log("content from sns", content);

  if (answered_question == null || visitor_id == null) {
    const err = new Error(`Missing required field`)
    console.log(err)
    return err;
  }

  if (languageCode == null) languageCode = 'ja';

  let sentiment, sentimentScore, keyPhrases;

  try {
    const [sentimentData, keyPhraseData] = await Promise.all([
      comprehend.detectSentiment({
        LanguageCode: languageCode,
        Text: answered_question
      }).promise(),

      comprehend.detectKeyPhrases({
        LanguageCode: languageCode,
        Text: answered_question
      }).promise()
    ]);

    sentiment = sentimentData.Sentiment
    sentimentScore = sentimentData.SentimentScore;
    keyPhrases = keyPhraseData.KeyPhrases;

  } catch (err) {
    console.log(err);
    return err;
  }


  const keys = {
    user_id: visitor_id
  };  // イベントを発生させるユーザーとの紐付け情報

  const events = [{
    event_name: 'questionnaire_analysis',
    values: {
      sentiment,
      sentimentScore,
      keyPhrases
    }
  }];

  // console.log(`start to trackEvents ${JSON.stringify(keys, null, 2)} ${JSON.stringify(events, null, 2)}`)
  try {
    const res = await trackEvents(keys, events);
    if (res.status !== 200) {
      console.log(`status is not 200 ${JSON.stringify(res, null, 2)}`)
    }
  } catch (err) {
    console.log(err);
    return err
  }

  return event;
};
