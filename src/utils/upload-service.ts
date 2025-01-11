import {
    S3Client,
} from '@aws-sdk/client-s3';

import {
    createPresignedPost
} from '@aws-sdk/s3-presigned-post'

import crypto from 'crypto';

export interface UploadServiceResponse{
    url:string;
    key:string;
}

export class UploadService{
    private s3Client: S3Client;
    private readonly region: string;
    private readonly bucket: string;
    private readonly uploadSizeLimit: number;
    private readonly uploadTimeLimit: number;

    constructor(bucket:string,region:string,uploadSizeLimit:string,uploadTimeLimit:string){
        this.region = region;
        this.bucket = bucket;
        this.uploadSizeLimit = parseInt(uploadSizeLimit,2);
        this.uploadTimeLimit = parseInt(uploadTimeLimit,2);
        this.s3Client = new S3Client({region:this.region});
    }

    public async generatePreSignedPost(userId:string):Promise<UploadServiceResponse> {
        const key: string = this.generateKey(userId);

        const presignedPost = await createPresignedPost(this.s3Client,{
            Bucket: this.bucket,
            Key: key,
            Conditions: [
                ["content-length-range",1,this.uploadSizeLimit],
            ],
            Expires: this.uploadTimeLimit,
        });

        return {
            url:presignedPost.url,
            key:key,
        };
    };

    private generateKey(userId:string):string {
        const timestamp: number = Date.now();
        const uniqueId: string = crypto.randomUUID();
        const hash: string = crypto.createHash('sha256')
            .update(`${userId}-${timestamp}-${uniqueId}`)
            .digest('hex')
            .substring(0,8);
        
        // Format: yyyy/mm/dd/userId/hash-uniqueId
        const date = new Date();
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth()+1).padStart(2,'0');
        const day = String(date.getUTCDate()).padStart(2,'0');

        return `${year}/${month}/${day}/${userId}/${hash}-${uniqueId}`;
    }

}


