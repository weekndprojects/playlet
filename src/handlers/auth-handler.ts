import {
    APIGatewayProxyEvent,
    APIGatewayProxyResult,
    Context
} from 'aws-lambda'

import {
    exceptionHandlerFunction,
    CustomError,
    Fault,
    ErrorName
} from '../utils/error-handling'

import {
    AuthService
} from '../services/auth/auth-service'

import {
    IRequest,
    IResponse
} from '../types/request-response.types'

import {
    ValidationField,
    ValidationResponse,
    ValidationService
} from '../services/auth/validation-service'

const authService = new AuthService(
    process.env.USER_POOL_ID!,
    process.env.CLIENT_ID!,
    process.env.AWS_DEFAULT_REGION!
)

/**
 * signupFunc expects
 * @param email 
 * @param password 
 * @returns IResponse
*/

const signupFunc = async (request: IRequest): Promise<IResponse> => {
    const validationResult:ValidationResponse = ValidationService.validate(request,[
        ValidationField.REQUEST_BODY,
        ValidationField.EMAIL,
        ValidationField.PASSWORD,
    ]);

    if (!validationResult.success){
        throw new CustomError (ErrorName.VALIDATION_ERROR,validationResult.message,400,Fault.CLIENT,true);
    }

    const { email, password } = request.body!;

    const createUserResponse = await authService.createUser(email,password);
    if (!createUserResponse){
        throw new CustomError (ErrorName.INTERNAL_ERROR,"Signup Failed,Try Again Later!",500,Fault.SERVER,true);
    }

    return {
        success: true,
        message: "Signup Successful",
    };
}

/**
 * loginFunc expects
 * @param email 
 * @param password 
 * @returns IResponse
*/

const loginFunc= async (request: IRequest): Promise<IResponse> => {
    const validationResult: ValidationResponse = ValidationService.validate(request,[
        ValidationField.REQUEST_BODY,
        ValidationField.EMAIL,
        ValidationField.PASSWORD,
    ]);

    if (!validationResult.success){
        throw new CustomError (ErrorName.VALIDATION_ERROR,validationResult.message,400,Fault.CLIENT,true);
    }

    const { email, password } = request.body!;

    const loginResponse = await authService.login(email,password);
    if (!loginResponse){
        throw new CustomError(ErrorName.INTERNAL_ERROR,"Login failed, Try again",401,Fault.CLIENT,true);
    }

    return {
        success: true,
        message: "Login, Successful!",
        data: loginResponse,
    };
}

/**
 * logoutFunc expects
 * @param 'x-access-token'
 * @returns IResponse
*/

const logoutFunc = async (request: IRequest): Promise<IResponse> => {
    const validationResult: ValidationResponse = ValidationService.validate(request,[
        ValidationField.REQUEST_HEADERS,
        ValidationField.ACCESS_TOKEN,
    ]);

    if (!validationResult.success){
        throw new CustomError (ErrorName.VALIDATION_ERROR,validationResult.message,400,Fault.CLIENT,true);
    }

    const accessToken = request.headers?.['x-access-token'];
    const token = accessToken?.slice(7)!;

    await authService.logout(token);

    return {
        success: true,
        message: 'Logged out successfully'
    };
}

/**
 * forgetPasswordFunc expects
 * @param email
 * @returns IResponse
*/

const forgetPasswordFunc = async (request: IRequest): Promise<IResponse> => {
    const validationResult:ValidationResponse = ValidationService.validate(request,[
        ValidationField.REQUEST_BODY,
        ValidationField.EMAIL,
    ]);

    if (!validationResult.success){
        throw new CustomError (ErrorName.VALIDATION_ERROR,validationResult.message,400,Fault.CLIENT,true);
    }

    const { email } = request.body!;

    const forgetPasswordResponse = await authService.forgetPassword(email);
    if (!forgetPasswordResponse) {
        throw new CustomError(ErrorName.INTERNAL_ERROR,"Unable to reset Password",500,Fault.SERVER,false);
    }

    return {
        success: true,
        message: 'Reset code sent successfully',
        data:forgetPasswordResponse,
    };
}

/**
 * forgetPasswordFunc expects
 * @param email
 * @param answer
 * @param password
 * @returns IResponse
*/

const confirmForgetPasswordFunc = async (request: IRequest): Promise<IResponse> => {
    const validationResult:ValidationResponse = ValidationService.validate(request,[
        ValidationField.REQUEST_BODY,
        ValidationField.EMAIL,
        ValidationField.PASSWORD,
        ValidationField.OTP,
    ]);

    if (!validationResult.success){
        throw new CustomError(ErrorName.VALIDATION_ERROR,validationResult.message,400,Fault.CLIENT,true);
    }

    const { email, answer, password } = request.body!;

    const confirmForgetPasswordResponse = await authService.confirmForgetPassword(email,password,answer);
    if(!confirmForgetPasswordResponse) {
        throw new CustomError(ErrorName.INTERNAL_ERROR,"Password Reset Failed",500,Fault.SERVER,false);
    }

    return {
        success: true,
        message: 'Password reset successfully',
    };
}

/**
 * forgetPasswordFunc expects
 * @param refreshToken
 * @returns IResponse
*/

const refreshSessionFunc = async (request: IRequest): Promise<IResponse> => {
    const validationResult:ValidationResponse = ValidationService.validate(request,[
        ValidationField.REQUEST_BODY,
        ValidationField.REFRESH_TOKEN,
    ]);

    if (!validationResult.success){
        throw new CustomError(ErrorName.VALIDATION_ERROR,validationResult.message,400,Fault.CLIENT,true);
    }

    const { refreshToken } = request.body!;
    const sessionRefreshResponse = await authService.refreshToken(refreshToken);
    if (!sessionRefreshResponse){
        throw new CustomError(ErrorName.INTERNAL_ERROR,"Session Refresh Failed",500,Fault.SERVER,false);
    }

    return {
        success: true,
        message: "Session Refresh Successful",
        data:sessionRefreshResponse,
    };
}

const executionFunctionMap: Record<string, (request: IRequest) => Promise<IResponse>> = {
    '/v1/auth/signup': signupFunc,
    '/v1/auth/login': loginFunc,
    '/v1/auth/logout': logoutFunc,
    '/v1/auth/forget-password': forgetPasswordFunc,
    '/v1/auth/forget-password/confirm': confirmForgetPasswordFunc,
    '/v1/auth/session/refresh': refreshSessionFunc
}

export const authHandler = async(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    try {
        const path = event.path;
        const executionFunction = executionFunctionMap[path];
        
        if (!executionFunction) {
            throw new CustomError(ErrorName.INTERNAL_ERROR,`No Function Mapping Found For ${path}`,404,Fault.CLIENT,true);
        }

        const request: IRequest = {
            headers: {
                ...(event.headers.Authorization || event.headers.authorization) && {
                    authorization: event.headers.Authorization || event.headers.authorization
                },
                ...(event.headers['X-Access-Token'] || event.headers['x-access-token']) && {
                    'x-access-token': event.headers['X-Access-Token'] || event.headers['x-access-token']
                }
            },
            body: event.body ? JSON.parse(event.body) : undefined
        };

        const response = await executionFunction(request);

        return {
            statusCode: 200,
            body: JSON.stringify(response)
        };

    } catch (error) {
        const errorResponse = exceptionHandlerFunction(error);
        return {
            statusCode:errorResponse.statusCode,
            body:JSON.stringify({
                success:false,
                message:errorResponse.message,
                body:{},
                error:errorResponse.metadata,
            }),
        };
    }
}