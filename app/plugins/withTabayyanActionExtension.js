const fs = require("fs");
const path = require("path");
const plist = require("@expo/plist").default;
const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
} = require("@expo/config-plugins");

const TARGET_NAME = "TabayyanAction";
const GROUP_NAME = "Embed Foundation Extensions";

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Ensures App Group entitlement is added to the main app target.
 */
function withMainAppEntitlements(config, appGroupId) {
  return withEntitlementsPlist(config, (config) => {
    const entitlements = config.modResults;
    const existingGroups = entitlements["com.apple.security.application-groups"] || [];
    if (!existingGroups.includes(appGroupId)) {
      entitlements["com.apple.security.application-groups"] = [...existingGroups, appGroupId];
    }
    return config;
  });
}

/**
 * Ensures App Group ID and local network ATS are configured in Info.plist.
 */
function withMainAppInfoPlist(config, appGroupId) {
  return withInfoPlist(config, (config) => {
    config.modResults["TabayyanAppGroupId"] = appGroupId;
    config.modResults.NSLocalNetworkUsageDescription = "يتصل تبيّن بخادم التحقق على شبكتك المحلية أو الخاصة لمعالجة النصوص والوسائط.";

    // Configure ATS for local network development server (10.66.66.2)
    const existingAts = config.modResults["NSAppTransportSecurity"] || {};
    config.modResults["NSAppTransportSecurity"] = {
      ...existingAts,
      NSAllowsLocalNetworking: true,
      NSExceptionDomains: {
        ...(existingAts.NSExceptionDomains || {}),
        "10.66.66.2": {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: false,
        },
      },
    };

    return config;
  });
}

/**
 * Configures the Action Extension target and files in the Xcode project.
 */
function withActionExtensionXcodeProject(config, { targetName, extensionBundleId, appGroupId }) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const { platformProjectRoot } = config.modRequest;

    // 1. Copy extension source files into ios/TabayyanAction/
    const pluginDir = path.join(__dirname, "tabayyan-action-extension");
    const targetDir = path.join(platformProjectRoot, targetName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy ActionViewController, Info.plist, TabayyanAction.entitlements, and localization directories
    const filesToCopy = [
      "ActionViewController.swift",
      "Info.plist",
      "TabayyanAction.entitlements",
    ];

    for (const f of filesToCopy) {
      const srcFile = path.join(pluginDir, f);
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(targetDir, f));
      }
    }

    fs.writeFileSync(path.join(targetDir, targetName + ".entitlements"), plist.build({
      "com.apple.security.application-groups": [appGroupId],
    }));
    const extensionInfoPath = path.join(targetDir, "Info.plist");
    const extensionInfo = plist.parse(fs.readFileSync(extensionInfoPath, "utf8"));
    extensionInfo.TabayyanAppGroupId = appGroupId;
    fs.writeFileSync(extensionInfoPath, plist.build(extensionInfo));

    const locDirs = ["ar.lproj", "en.lproj"];
    for (const d of locDirs) {
      const srcD = path.join(pluginDir, d);
      const destD = path.join(targetDir, d);
      if (fs.existsSync(srcD)) {
        copyDirSync(srcD, destD);
      }
    }

    // 2. Copy native bridge files into ios/<MainApp>/
    const mainTargetName = xcodeProject.getFirstTarget().firstTarget.name.replace(/^"|"$/g, "");
    const mainAppDir = path.join(platformProjectRoot, mainTargetName);
    const bridgeSrcDir = path.join(pluginDir, "bridge");

    if (fs.existsSync(bridgeSrcDir) && fs.existsSync(mainAppDir)) {
      const bridgeFiles = ["TabayyanShareBridge.swift", "TabayyanShareBridge.m"];
      for (const bf of bridgeFiles) {
        const srcBf = path.join(bridgeSrcDir, bf);
        if (fs.existsSync(srcBf)) {
          fs.copyFileSync(srcBf, path.join(mainAppDir, bf));
        }
      }
    }

    // 3. Check for existing target (idempotency check)
    const targets = xcodeProject.pbxNativeTargetSection();
    let existingTarget = null;
    for (const key of Object.keys(targets)) {
      if (key.endsWith("_comment")) continue;
      const target = targets[key];
      if (target && (target.name === targetName || target.productName === targetName)) {
        existingTarget = target;
        break;
      }
    }

    if (existingTarget) {
      // Target already exists, do not duplicate
      return config;
    }

    // 4. Create new Action Extension target
    const targetUuid = xcodeProject.generateUuid();

    // Add XCConfigurationList
    const commonSettings = {
      ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS: "YES",
      CLANG_ANALYZER_NONNULL: "YES",
      CODE_SIGN_STYLE: "Automatic",
      CODE_SIGN_ENTITLEMENTS: `"${targetName}/${targetName}.entitlements"`,
      CURRENT_PROJECT_VERSION: `"${config.ios?.buildNumber ?? '1'}"`,
      ENABLE_USER_SCRIPT_SANDBOXING: "YES",
      GENERATE_INFOPLIST_FILE: "NO",
      INFOPLIST_FILE: `"${targetName}/Info.plist"`,
      INFOPLIST_KEY_CFBundleDisplayName: `"Verify with Tabayyan"`,
      IPHONEOS_DEPLOYMENT_TARGET: '"16.4"',
      APPLICATION_EXTENSION_API_ONLY: "YES",
      PRODUCT_MODULE_NAME: targetName,
      DEVELOPMENT_LANGUAGE: "en",
      LD_RUNPATH_SEARCH_PATHS: [
        '"$(inherited)"',
        '"@executable_path/Frameworks"',
        '"@executable_path/../../Frameworks"',
      ],
      MARKETING_VERSION: `"${config.version ?? '1.0.0'}"`,
      PRODUCT_BUNDLE_IDENTIFIER: `"${extensionBundleId}"`,
      PRODUCT_NAME: '"$(TARGET_NAME)"',
      SKIP_INSTALL: "YES",
      SWIFT_VERSION: "5.0",
      TARGETED_DEVICE_FAMILY: '"1,2"',
    };

    const xcConfigurations = [
      {
        name: "Debug",
        isa: "XCBuildConfiguration",
        buildSettings: {
          ...commonSettings,
          DEBUG_INFORMATION_FORMAT: "dwarf",
          SWIFT_OPTIMIZATION_LEVEL: '"-Onone"',
          SWIFT_ACTIVE_COMPILATION_CONDITIONS: '"DEBUG $(inherited)"',
        },
      },
      {
        name: "Release",
        isa: "XCBuildConfiguration",
        buildSettings: {
          ...commonSettings,
          COPY_PHASE_STRIP: "NO",
          DEBUG_INFORMATION_FORMAT: '"dwarf-with-dsym"',
          SWIFT_COMPILATION_MODE: "wholemodule",
        },
      },
    ];

    const xcConfigList = xcodeProject.addXCConfigurationList(
      xcConfigurations,
      "Release",
      `Build configuration list for PBXNativeTarget "${targetName}"`
    );

    // Add product file in Products group
    const productFile = xcodeProject.addProductFile(targetName, {
      group: "Embed Foundation Extensions",
      target: targetUuid,
      explicitFileType: '"wrapper.app-extension"',
      includeInIndex: 0,
      path: `"${targetName}.appex"`,
      sourceTree: "BUILT_PRODUCTS_DIR",
    });

    // Copy-phase entries must refer to a real PBXBuildFile, not a dangling UUID.
    productFile.settings = { ATTRIBUTES: ["RemoveHeadersOnCopy"] };
    xcodeProject.addToPbxBuildFileSection(productFile);

    // Add native target
    const pbxNativeTarget = {
      uuid: targetUuid,
      pbxNativeTarget: {
        isa: "PBXNativeTarget",
        name: targetName,
        productName: targetName,
        productReference: productFile.fileRef,
        productType: '"com.apple.product-type.app-extension"',
        buildConfigurationList: xcConfigList.uuid,
        buildPhases: [],
        buildRules: [],
        dependencies: [],
      },
    };
    xcodeProject.addToPbxNativeTargetSection(pbxNativeTarget);

    // Add to project section targets
    const projectSection = xcodeProject.pbxProjectSection();
    const firstProjectKey = xcodeProject.getFirstProject().uuid;
    if (projectSection && projectSection[firstProjectKey]) {
      projectSection[firstProjectKey].targets.push({
        value: targetUuid,
        comment: targetName,
      });
    }

    // Build Phases for the extension
    const folderType = "app_extension";
    const buildPath = '""';

    // 1. Sources: ActionViewController.swift
    const swiftFilePath = path.join(targetName, "ActionViewController.swift");
    xcodeProject.addBuildPhase(
      [swiftFilePath],
      "PBXSourcesBuildPhase",
      targetName,
      targetUuid,
      folderType,
      buildPath
    );

    // 2. Resources: ar.lproj and en.lproj
    const resourceFiles = [
      path.join(targetName, "ar.lproj", "InfoPlist.strings"),
      path.join(targetName, "en.lproj", "InfoPlist.strings"),
    ];
    const resourcePhase = xcodeProject.addBuildPhase(
      [],
      "PBXResourcesBuildPhase",
      targetName,
      targetUuid,
      folderType,
      buildPath
    );
    // Localizations are ONE resource with language variants, not two files
    // copied to the same InfoPlist.strings destination.
    const objects = xcodeProject.hash.project.objects;
    objects.PBXVariantGroup ||= {};
    const variantId = xcodeProject.generateUuid();
    const variantBuildId = xcodeProject.generateUuid();
    objects.PBXVariantGroup[variantId] = {
      isa: "PBXVariantGroup", name: "InfoPlist.strings",
      sourceTree: '"<group>"', children: [],
    };
    objects.PBXVariantGroup[variantId + "_comment"] = "InfoPlist.strings";
    for (const language of ["ar", "en"]) {
      const refId = xcodeProject.generateUuid();
      objects.PBXFileReference[refId] = {
        isa: "PBXFileReference", lastKnownFileType: "text.plist.strings",
        name: language, path: '"' + targetName + "/" + language + '.lproj/InfoPlist.strings"',
        sourceTree: '"<group>"',
      };
      objects.PBXFileReference[refId + "_comment"] = language;
      objects.PBXVariantGroup[variantId].children.push({ value: refId, comment: language });
      xcodeProject.addKnownRegion(language);
    }
    objects.PBXBuildFile[variantBuildId] = {
      isa: "PBXBuildFile", fileRef: variantId, fileRef_comment: "InfoPlist.strings",
    };
    objects.PBXBuildFile[variantBuildId + "_comment"] = "InfoPlist.strings in Resources";
    resourcePhase.buildPhase.files.push({ value: variantBuildId, comment: "InfoPlist.strings in Resources" });

    // 3. Frameworks
    xcodeProject.addBuildPhase(
      [],
      "PBXFrameworksBuildPhase",
      targetName,
      targetUuid,
      folderType,
      buildPath
    );

    // 4. Embed in main target via PBXCopyFilesBuildPhase
    const mainTargetUuid = xcodeProject.getFirstTarget().uuid;
    objects.PBXTargetDependency ||= {};
    objects.PBXContainerItemProxy ||= {};
    xcodeProject.addTargetDependency(mainTargetUuid, [targetUuid]);
    xcodeProject.addBuildPhase(
      [],
      "PBXCopyFilesBuildPhase",
      GROUP_NAME,
      mainTargetUuid,
      folderType,
      buildPath
    );
    const copyFilesPhase = xcodeProject.buildPhaseObject(
      "PBXCopyFilesBuildPhase",
      GROUP_NAME,
      mainTargetUuid
    );
    if (copyFilesPhase && copyFilesPhase.files) {
      copyFilesPhase.files.push({
        value: productFile.uuid,
        comment: `${targetName}.appex in ${GROUP_NAME}`,
      });
    }

    // Add PBXGroup for TabayyanAction
    const extGroupFiles = [
      swiftFilePath,
      path.join(targetName, "Info.plist"),
      path.join(targetName, `${targetName}.entitlements`),
    ];
    const extGroup = xcodeProject.addPbxGroup(extGroupFiles, targetName, '""');
    xcodeProject.getPBXGroupByKey(extGroup.uuid).children.push({ value: variantId, comment: "InfoPlist.strings" });
    const rootGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
    const rootGroup = xcodeProject.getPBXGroupByKey(rootGroupKey);
    if (rootGroup && rootGroup.children && extGroup && extGroup.uuid) {
      const alreadyInRoot = rootGroup.children.some((c) => c.value === extGroup.uuid);
      if (!alreadyInRoot) {
        rootGroup.children.push({
          value: extGroup.uuid,
          comment: targetName,
        });
      }
    }

    // 5. Add bridge files to main target sources & group
    if (fs.existsSync(mainAppDir)) {
      const bridgeSwift = path.join(mainTargetName, "TabayyanShareBridge.swift");
      const bridgeM = path.join(mainTargetName, "TabayyanShareBridge.m");

      const mainGroupKey =
        xcodeProject.findPBXGroupKey({ name: mainTargetName }) ||
        xcodeProject.findPBXGroupKey({ path: mainTargetName }) ||
        rootGroupKey;

      if (!xcodeProject.hasFile(bridgeSwift)) {
        xcodeProject.addSourceFile(bridgeSwift, { target: mainTargetUuid }, rootGroupKey);
      }
      if (!xcodeProject.hasFile(bridgeM)) {
        xcodeProject.addSourceFile(bridgeM, { target: mainTargetUuid }, rootGroupKey);
      }
    }

    // node-xcode can leave undefined fields which its writer serializes literally.
    const clean = value => {
      if (!value || typeof value !== "object") return;
      for (const key of Object.keys(value)) {
        if (value[key] === undefined) delete value[key];
        else clean(value[key]);
      }
    };
    clean(objects);
    return config;
  });
}

/**
 * Main plugin entry
 */
const withTabayyanActionExtension = (config) => {
  const bundleIdentifier = config.ios?.bundleIdentifier || "com.roolxi.tabayyan";
  const extensionBundleId = `${bundleIdentifier}.action`;
  const appGroupId = `group.${bundleIdentifier}`;

  config = withMainAppEntitlements(config, appGroupId);
  config = withMainAppInfoPlist(config, appGroupId);
  config = withActionExtensionXcodeProject(config, {
    targetName: TARGET_NAME,
    extensionBundleId,
    appGroupId,
  });

  return config;
};

module.exports = withTabayyanActionExtension;
