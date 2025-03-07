import {
    PutItemCommand,
    DynamoDBClient,
    UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'

export enum MetadataPath {
    VALIDATION_BASIC = 'validation.basic',
    VALIDATION_STREAM = 'validation.stream',
    METADATA_TECHNICAL = 'metadata.technical',
    METADATA_QUALITY = 'metadata.quality',
    METADATA_CONTENT = 'metadata.content'
}

export enum ProcessingStage {
    UPLOAD = 'upload',
    VALIDATION = 'validation',
    METADATA = 'metadata',
    GOP_CREATION = 'gopCreation',
    TRANSCODING = 'transcoding',
    COMPLETION = 'completion',
    DISTRIBUTION = 'distribution'
}

interface UpdateCommandParams {
    UpdateExpression: string;
    ExpressionAttributeNames: Record<string, string>;
    ExpressionAttributeValues: Record<string, any>;
}

export class MetadataCache {
    private readonly dbclient: DynamoDBClient;
    private readonly table: string;

    constructor(table: string, private region: string) {
        this.table = table;
        this.dbclient = new DynamoDBClient({ region: this.region });
    }

    public async InitializeRecord(userId: string, assetId: string): Promise<boolean> {
   
        const command = new PutItemCommand({
            TableName: this.table,
            Item: {
                userId: { S: userId },
                assetId: { S: assetId },
                createdAt: { S: new Date().toISOString() },
                metadata: {
                    M: {
                        validation: { 
                            M: {
                                basic: { M: {} },
                                stream: { M: {} }
                            }
                        },
                        technical: { M: {} },
                        quality: { M: {} },
                        content: { M: {} }
                    }
                },
                progress: {
                    M: {
                        upload: { BOOL: false },
                        validation: { BOOL: false },
                        metadata: { BOOL: false },
                        gopCreation: { BOOL: false },
                        transcoding: { BOOL: false },
                        completion: {BOOL: false },
                        distribution: {BOOL: false },
                        updatedAt: { S: new Date().toISOString() },
                        hasCriticalFailure: { BOOL: false }
                    }
                }
            },
            ConditionExpression:"attribute_not_exists(userId) AND attribute_not_exists(assetId)"
        });

        const response = await this.dbclient.send(command);
        return response.$metadata.httpStatusCode === 200;

    }

    public async updateMetadata(userId: string,assetId: string,path: MetadataPath,data: any): Promise<boolean> {

        const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } = this.createUpdateCommand(path, data);

        const command = new UpdateItemCommand({
            TableName: this.table,
            Key: {
                userId: { S: userId },
                assetId: { S: assetId }
            },
            UpdateExpression,
            ExpressionAttributeNames,
            ExpressionAttributeValues
        });

        const response = await this.dbclient.send(command);
        return response.$metadata.httpStatusCode === 200;
    }

    public async updateProgress(userId: string, assetId: string, stage: ProcessingStage, value: boolean): Promise<boolean> {
        const command = new UpdateItemCommand({
            TableName: this.table,
            Key: {
                userId: { S: userId },
                assetId: { S: assetId }
            },
            UpdateExpression: 'SET progress.#stage = :value, progress.updatedAt = :time',
            ExpressionAttributeNames: {
                '#stage': stage
            },
            ExpressionAttributeValues: {
                ':value': { BOOL: value },
                ':time': { S: new Date().toISOString() }
            }
        });

        const response = await this.dbclient.send(command);
        return response.$metadata.httpStatusCode === 200;
    }

    public async markCriticalFailure( userId: string, assetId: string, value: boolean): Promise<boolean> {
        const command = new UpdateItemCommand({
            TableName: this.table,
            Key: {
                userId: { S: userId },
                assetId: { S: assetId }
            },
            UpdateExpression: 'SET progress.hasCriticalFailure = :value, progress.updatedAt = :time',
            ExpressionAttributeValues: {
                ':value': { BOOL: value },
                ':time': { S: new Date().toISOString() }
            }
        });
        const response = await this.dbclient.send(command);
        return response.$metadata.httpStatusCode === 200;
    }

    private readonly UPDATE_PATHS: Record<MetadataPath, string[]> = {
        [MetadataPath.VALIDATION_BASIC]: ['metadata', 'validation', 'basic'],
        [MetadataPath.VALIDATION_STREAM]: ['metadata', 'validation', 'stream'],
        [MetadataPath.METADATA_TECHNICAL]: ['metadata', 'technical'],
        [MetadataPath.METADATA_QUALITY]: ['metadata', 'quality'],
        [MetadataPath.METADATA_CONTENT]: ['metadata', 'content']
    };
    
    private createUpdateCommand(path: MetadataPath, data: any): UpdateCommandParams {
        const pathParts = this.UPDATE_PATHS[path];
    
        const attributeNames = pathParts.reduce((acc, part) => ({
            ...acc,
            [`#${part}`]: part
        }), {});
    
        return {
            UpdateExpression: `SET ${pathParts.map(p => `#${p}`).join('.')} = :data`,
            ExpressionAttributeNames: attributeNames,
            ExpressionAttributeValues: {
                ':data': { M: this.convertToMapAttribute(data) }
            }
        };
    }

    private convertToMapAttribute(data: any): Record<string, any> {
        const result: Record<string, any> = {};
        
        Object.entries(data).forEach(([key, value]) => {
            if (value === null || value === undefined || value === 'N/A') {
                result[key] = { NULL: true };
            } else if (typeof value === 'boolean') {
                result[key] = { BOOL: value };
            } else if (typeof value === 'number') {
                result[key] = { N: value.toString() };
            } else if (typeof value === 'object') {
                result[key] = { M: this.convertToMapAttribute(value) };
            }else {
                result[key] = { S: value.toString() };
            }
        });
        return result;
    }
}