# body-battery-to-slack-status

CLI tool to Share Body Battery in your Slack team.

Knowing teammate's body battery is useful.High body battery member may be able to do a complex work. Low body battery member should rest.

- Login to Garmin Connect via Puppeteer
- Set Body Battery, Stress, Heart Rate to your Slack Status
- Currently this script uses [Legacy tokens](https://api.slack.com/legacy/custom-integrations/legacy-tokens).

This screenshot means current condition is 😣, Body Battery is 21, Stress is 31, Heart Beat 70.

![image](https://user-images.githubusercontent.com/18360/76140557-24b30500-609f-11ea-8b0f-c68b0c6cec48.png)

## HOW TO USE
Set environment variable to login, and `npm start` will launch Puppeteer and set your Slack Status every 10 minutes.
```
$ npm ci
$ GARMIN_MAIL_ADDRESS=... GARMIN_PASSWORD=... SLACK_LEGACY_TOKEN=... npm start
```

## CUSTOMIZE EMOJI

Default emoji set is 😫😖😣😞😉🙂😅😃😆🤩.
You can set EMOJIS environment variable to customize status emoji set.

For example,
```
EMOJIS=':ant: :butterfly: :bee:'
```

will make the rule below.

| Body Battery | Emoji |
|--------------|------|
| 0〜33        | 🐜    |
| 34〜66       | 🦋    |
| 67〜100      | 🐝    |

## RUN ON CI

Default behavior is daemon mode. To run on CI service(like a GitHub Actions), set `CI=true` to run only once.

```
CI=true npm start
```


## TODO

- Implement as Electron App to easily using.