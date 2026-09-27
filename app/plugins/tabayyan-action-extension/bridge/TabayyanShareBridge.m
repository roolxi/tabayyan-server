#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TabayyanShareBridge, NSObject)

RCT_EXTERN_METHOD(getPendingSharedPayload:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearPendingSharedPayload:(NSString *)expectedId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

@end
