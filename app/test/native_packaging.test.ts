import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const xcode = require("xcode");
const plugin = require("../plugins/withTabayyanActionExtension");
const plist = require("@expo/plist").default;

it("executes the actual plugin: embedded product, dependency, localizations and repeatability", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tabayyan-plugin-"));
  try {
    fs.mkdirSync(path.join(directory, "Tabayyan"));
    const project = xcode.project(path.join(directory, "project.pbxproj"));
    const objects: any = {
      PBXProject: { ROOT: { isa: "PBXProject", mainGroup: "GROUP", targets: [{ value: "APP", comment: "Tabayyan" }] } },
      PBXGroup: {
        GROUP: { isa: "PBXGroup", children: [], sourceTree: '"<group>"' },
        PRODUCTS: { isa: "PBXGroup", name: "Products", children: [] },
      },
      PBXNativeTarget: {
        APP: { isa: "PBXNativeTarget", name: "Tabayyan", dependencies: [],
          productType: '"com.apple.product-type.application"',
          buildPhases: [{ value: "SOURCES", comment: "Sources" }] },
      },
      PBXSourcesBuildPhase: { SOURCES: { isa: "PBXSourcesBuildPhase", files: [] }, SOURCES_comment: "Sources" },
      PBXResourcesBuildPhase: {}, PBXFrameworksBuildPhase: {}, PBXCopyFilesBuildPhase: {},
      PBXBuildFile: {}, PBXFileReference: {}, XCConfigurationList: {}, XCBuildConfiguration: {},
    };
    project.hash = { project: { rootObject: "ROOT", objects } };
    const config = plugin({ name: "Tabayyan", slug: "tabayyan", version: "1.0.0",
      ios: { bundleIdentifier: "com.example.custom", buildNumber: "9" } });
    const invoke = () => config.mods.ios.xcodeproj({
      ...config, modResults: project, modRequest: { platformProjectRoot: directory },
    });
    await invoke();
    const entries = (section: string) => Object.entries(objects[section] || {}).filter(([key]) => !key.endsWith("_comment")) as [string, any][];
    const extensions = entries("PBXNativeTarget").filter(([, t]) => t.productType === '"com.apple.product-type.app-extension"');
    assert.equal(extensions.length, 1);
    const [extensionId, extension] = extensions[0];
    assert.equal(objects.PBXNativeTarget.APP.dependencies.length, 1);
    const dependency = objects.PBXTargetDependency[objects.PBXNativeTarget.APP.dependencies[0].value];
    assert.equal(dependency.target, extensionId);
    const copies = entries("PBXCopyFilesBuildPhase");
    assert.equal(copies.length, 1);
    assert.equal(Number(copies[0][1].dstSubfolderSpec), 13);
    const copy = copies[0][1].files[0];
    assert.equal(objects.PBXBuildFile[copy.value].fileRef, extension.productReference);
    const resources = entries("PBXResourcesBuildPhase")[0][1];
    assert.equal(resources.files.length, 1);
    const resourceRef = objects.PBXBuildFile[resources.files[0].value].fileRef;
    assert.equal(objects.PBXVariantGroup[resourceRef].children.length, 2);
    for (const phase of [...entries("PBXSourcesBuildPhase"), ...entries("PBXResourcesBuildPhase"), ...copies]) {
      for (const file of phase[1].files) assert.ok(objects.PBXBuildFile[file.value], "dangling build reference");
    }
    const entitlements = plist.parse(fs.readFileSync(path.join(directory, "TabayyanAction/TabayyanAction.entitlements"), "utf8"));
    assert.deepEqual(entitlements["com.apple.security.application-groups"], ["group.com.example.custom"]);
    const before = project.writeSync();
    assert.ok(!before.includes("= undefined;"));
    await invoke();
    assert.equal(project.writeSync(), before, "running prebuild twice must not change the graph");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
