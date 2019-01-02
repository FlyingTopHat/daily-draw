import { IRecords } from "aws-types-lib";
import { model } from "dynamoose";
import dynamoose = require("dynamoose");
import lambdaTester from "lambda-tester";
import { IBasicImageDetails } from "messages-lib/lib";
import uuidv4 from "uuid/v4";
import waitForExpect from "wait-for-expect";
import { handler } from "../main";
import { ImageModel, imageSchema } from "../saveImageDetails";

// tslint:disable-next-line:no-var-requires
require("lambda-tester").noVersionCheck();

const dynamodbRespond = async () => {
  console.log("Attempting to connect");
  await dynamoose
    .ddb()
    .listTables()
    .promise();
};

const expectMessageProperty = (expectedMessage: string) => {
  return (item: { message: string }) => {
    expect(item.message).toBe(expectedMessage);
  };
};

const configureLocalDynamoDB = () => {
  dynamoose.AWS.config.update({
    accessKeyId: "AKID",
    secretAccessKey: "SECRET",
    region: "us-east-1",
  });

  dynamoose.local("http://0.0.0.0:8000");
};

const jestDefaultTimeout = 5000;
const waitForLocalStackTimeout = 30000;
jest.setTimeout(waitForLocalStackTimeout + jestDefaultTimeout);

describe("Handles ImageDetails message over SNS", () => {
  const tableName = "Test";
  const imageIdColumnName = "ImageId";

  beforeAll(async () => {
    configureLocalDynamoDB();
    await waitForExpect(dynamodbRespond, waitForLocalStackTimeout);
    console.log("Successfully connected to DynamoDB instance");
  });

  it("Succeeds with publicUrl of image from event", () => {
    const imageId = uuidv4();
    const imageDetails: IBasicImageDetails = {
      imageId,
      description: "Hello World",
    };
    const snsEvent: IRecords = {
      Records: [
        {
          EventSource: "aws:sns",
          Sns: {
            Message: JSON.stringify(imageDetails),
          },
        },
      ],
    };

    const ImageRecord = model<ImageModel, { DateId: string }>(tableName, imageSchema);

    process.env.TABLE_NAME = tableName;

    return lambdaTester(handler)
      .event(snsEvent)
      .expectResult(async () => {
        const record = await ImageRecord.queryOne(imageIdColumnName)
          .eq(imageId)
          .exec();

        expect(record).toMatchObject({
          ImageId: imageId,
          Description: "Hello World",
        });
      });
  });

  it("Fails validation when event does not match SNS schema", () => {
    const emptyEvent = {};

    return lambdaTester(handler)
      .event(emptyEvent)
      .expectError(expectMessageProperty("Event object failed validation"));
  });
});
