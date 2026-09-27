import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
// @ts-ignore
import xcode from "xcode";

describe("withTabayyanActionExtension Plugin", () => {
  it("Action Extension Info.plist contains com.apple.ui-services and activation rules", () => {
    const infoPlistPath = path.join(__dirname, "../plugins/tabayyan-action-extension/Info.plist");
    assert.equal(fs.existsSync(infoPlistPath), true);
    const content = fs.readFileSync(infoPlistPath, "utf-8");

    // Must be an action extension (com.apple.ui-services), NOT share-services
    assert.ok(content.includes("com.apple.ui-services"));
    assert.ok(!content.includes("com.apple.share-services"));

    // Must have activation rules for web URL and text
    assert.ok(content.includes("NSExtensionActivationSupportsWebURLWithMaxCount"));
    assert.ok(content.includes("NSExtensionActivationSupportsText"));
  });

  it("Action Extension contains Arabic and English localization files", () => {
    const arPath = path.join(__dirname, "../plugins/tabayyan-action-extension/ar.lproj/InfoPlist.strings");
    const enPath = path.join(__dirname, "../plugins/tabayyan-action-extension/en.lproj/InfoPlist.strings");

    assert.equal(fs.existsSync(arPath), true);
    assert.equal(fs.existsSync(enPath), true);

    const arContent = fs.readFileSync(arPath, "utf-8");
    const enContent = fs.readFileSync(enPath, "utf-8");

    assert.ok(arContent.includes("تحقّق عبر تبيّن"));
    assert.ok(enContent.includes("Verify with Tabayyan"));
  });

  it("Action Extension entitlements include App Group group.com.roolxi.tabayyan", () => {
    const entPath = path.join(__dirname, "../plugins/tabayyan-action-extension/TabayyanAction.entitlements");
    assert.equal(fs.existsSync(entPath), true);
    const content = fs.readFileSync(entPath, "utf-8");

    assert.ok(content.includes("com.apple.security.application-groups"));
    assert.ok(content.includes("group.com.roolxi.tabayyan"));
  });

  it("ActionViewController implements host allowlist and safe deep link opening", () => {
    const swiftPath = path.join(__dirname, "../plugins/tabayyan-action-extension/ActionViewController.swift");
    assert.equal(fs.existsSync(swiftPath), true);
    const code = fs.readFileSync(swiftPath, "utf-8");

    // Hosts
    assert.ok(code.includes("instagram.com"));
    assert.ok(code.includes("tiktok.com"));
    assert.ok(code.includes("youtube.com"));

    // Deep link scheme
    assert.ok(code.includes("tabayyan://handle-share?url="));

    // Extension context open without UIApplication.shared
    assert.ok(code.includes("extensionContext?.open"));
    assert.ok(!code.includes("UIApplication.shared"));

    // App Group fallback
    assert.ok(code.includes("UserDefaults(suiteName:"));
  });

  it("Native bridge files exist and export getPendingSharedPayload and clearPendingSharedPayload", () => {
    const swiftBridge = path.join(__dirname, "../plugins/tabayyan-action-extension/bridge/TabayyanShareBridge.swift");
    const mBridge = path.join(__dirname, "../plugins/tabayyan-action-extension/bridge/TabayyanShareBridge.m");

    assert.equal(fs.existsSync(swiftBridge), true);
    assert.equal(fs.existsSync(mBridge), true);

    const swiftCode = fs.readFileSync(swiftBridge, "utf-8");
    const mCode = fs.readFileSync(mBridge, "utf-8");

    assert.ok(swiftCode.includes("getPendingSharedPayload"));
    assert.ok(swiftCode.includes("clearPendingSharedPayload"));
    assert.ok(mCode.includes("RCT_EXTERN_MODULE(TabayyanShareBridge, NSObject)"));
  });

  it("modifies Xcode project structure without crashing or missing Plugins group", () => {
    const proj = xcode.project("test.xcodeproj/project.pbxproj");
    proj.hash = {
      project: {
        objects: {
          PBXProject: {},
          PBXGroup: {},
          PBXNativeTarget: {},
          PBXSourcesBuildPhase: {},
          PBXResourcesBuildPhase: {},
          PBXFrameworksBuildPhase: {},
          PBXCopyFilesBuildPhase: {},
          PBXBuildFile: {},
          PBXFileReference: {},
          XCConfigurationList: {},
        },
      },
    };

    const mainTargetUuid = proj.generateUuid();
    const mainGroupUuid = proj.generateUuid();

    proj.hash.project.objects.PBXProject["PROJ_UUID"] = {
      isa: "PBXProject",
      mainGroup: mainGroupUuid,
      targets: [{ value: mainTargetUuid, comment: "tabayyan" }],
    };
    proj.hash.project.objects.PBXGroup[mainGroupUuid] = {
      isa: "PBXGroup",
      children: [],
      name: "tabayyan",
    };
    proj.hash.project.objects.PBXGroup["PRODUCTS_UUID"] = {
      isa: "PBXGroup",
      children: [],
      name: "Products",
    };
    proj.hash.project.objects.PBXNativeTarget[mainTargetUuid] = {
      isa: "PBXNativeTarget",
      name: "tabayyan",
      productName: "tabayyan",
      buildPhases: [{ value: "SOURCES_UUID", comment: "Sources" }],
    };
    proj.hash.project.objects.PBXSourcesBuildPhase["SOURCES_UUID"] = {
      isa: "PBXSourcesBuildPhase",
      files: [],
    };
    proj.hash.project.objects.PBXSourcesBuildPhase["SOURCES_UUID_comment"] = "Sources";

    const mainTargetName = "tabayyan";
    const mainGroupKey =
      proj.findPBXGroupKey({ name: mainTargetName }) ||
      proj.findPBXGroupKey({ path: mainTargetName }) ||
      proj.getFirstProject().firstProject.mainGroup;

    assert.ok(mainGroupKey);

    // This must NOT call addPluginFile or crash with Cannot read properties of null (reading 'path')
    proj.addSourceFile("tabayyan/TabayyanShareBridge.swift", { target: mainTargetUuid }, mainGroupKey);
    proj.addSourceFile("tabayyan/TabayyanShareBridge.m", { target: mainTargetUuid }, mainGroupKey);

    assert.ok(proj.hasFile("tabayyan/TabayyanShareBridge.swift"));
    assert.ok(proj.hasFile("tabayyan/TabayyanShareBridge.m"));
  });
});
