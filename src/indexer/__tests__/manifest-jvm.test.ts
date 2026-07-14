/**
 * Tests for the JVM manifest parsers (parsePom / parseGradle /
 * parseSbt / parseMill) added in plans/jvm-languages.md §3.
 *
 * Uses real fixture content written to a tmp dir; the parseManifest
 * dispatch path is exercised end-to-end via repo-root detection.
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseManifest } from '../manifest.js';

let TMP: string;
before(() => { TMP = mkdtempSync(join(tmpdir(), 'manifest-jvm-')); });
after(() => { rmSync(TMP, { recursive: true, force: true }); });

function withFixture(name: string, content: string): string {
	const dir = mkdtempSync(join(TMP, `${name}-`));
	writeFileSync(join(dir, name), content);
	return dir;
}

// ---------------------------------------------------------------------------
// Maven pom.xml
// ---------------------------------------------------------------------------

describe('parseManifest - Maven pom.xml', () => {
	it('extracts groupId:artifactId + version triples from <dependency> blocks', () => {
		const dir = withFixture('pom.xml', `<?xml version="1.0"?>
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>my-app</artifactId>
  <version>1.0.0</version>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <version>3.2.0</version>
    </dependency>
    <dependency>
      <groupId>com.fasterxml.jackson.core</groupId>
      <artifactId>jackson-databind</artifactId>
      <version>2.16.0</version>
    </dependency>
  </dependencies>
</project>
`);
		const deps = parseManifest(dir);
		assert.equal(deps.length, 2);
		assert.deepEqual(deps[0], {
			name: 'org.springframework.boot:spring-boot-starter-web',
			version: '3.2.0',
		});
		assert.deepEqual(deps[1], {
			name: 'com.fasterxml.jackson.core:jackson-databind',
			version: '2.16.0',
		});
	});

	it('substitutes ${...} placeholders against same-pom <properties>', () => {
		const dir = withFixture('pom.xml', `<project>
  <properties>
    <spring.version>3.2.0</spring.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>\${spring.version}</version>
    </dependency>
  </dependencies>
</project>
`);
		const deps = parseManifest(dir);
		assert.equal(deps[0]?.version, '3.2.0');
	});

	it('excludes <dependencyManagement> entries from the runtime dep list', () => {
		const dir = withFixture('pom.xml', `<project>
  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>com.example</groupId>
        <artifactId>bom</artifactId>
        <version>1.0</version>
      </dependency>
    </dependencies>
  </dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>com.example</groupId>
      <artifactId>app</artifactId>
      <version>2.0</version>
    </dependency>
  </dependencies>
</project>
`);
		const deps = parseManifest(dir);
		assert.equal(deps.length, 1);
		assert.equal(deps[0]?.name, 'com.example:app');
	});

	it('handles dependencies without an explicit <version>', () => {
		const dir = withFixture('pom.xml', `<project>
  <dependencies>
    <dependency>
      <groupId>com.example</groupId>
      <artifactId>app</artifactId>
    </dependency>
  </dependencies>
</project>
`);
		const deps = parseManifest(dir);
		assert.equal(deps.length, 1);
		assert.equal(deps[0]?.name, 'com.example:app');
		assert.equal(deps[0]?.version, undefined);
	});
});

// ---------------------------------------------------------------------------
// Gradle build.gradle / build.gradle.kts
// ---------------------------------------------------------------------------

describe('parseManifest - Gradle (Groovy DSL)', () => {
	it('extracts triples from `implementation` + `api` + `testImplementation`', () => {
		const dir = withFixture('build.gradle', `
plugins {
  id 'java'
}

dependencies {
  implementation 'com.google.guava:guava:33.0.0-jre'
  api 'org.slf4j:slf4j-api:2.0.7'
  testImplementation 'junit:junit:4.13.2'
  // commented out -- ignored
  // implementation 'should:not:appear'
}
`);
		const deps = parseManifest(dir);
		const names = deps.map(d => d.name).sort();
		assert.deepEqual(names, [
			'com.google.guava:guava',
			'junit:junit',
			'org.slf4j:slf4j-api',
		]);
	});

	it('skips project() refs + interpolated strings', () => {
		const dir = withFixture('build.gradle', `
dependencies {
  implementation project(':shared')
  implementation ':another-project'
  implementation 'com.example:lib:1.0'
}
`);
		const deps = parseManifest(dir);
		assert.equal(deps.length, 1);
		assert.equal(deps[0]?.name, 'com.example:lib');
	});
});

describe('parseManifest - Gradle (Kotlin DSL)', () => {
	it('extracts triples from build.gradle.kts double-quoted strings', () => {
		const dir = withFixture('build.gradle.kts', `
plugins {
  java
}

dependencies {
  implementation("com.google.guava:guava:33.0.0-jre")
  testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
}
`);
		const deps = parseManifest(dir);
		assert.equal(deps.length, 2);
		const names = deps.map(d => d.name).sort();
		assert.deepEqual(names, [
			'com.google.guava:guava',
			'org.junit.jupiter:junit-jupiter',
		]);
	});

	it('prefers Gradle (Kotlin) over (Groovy) when both are present', () => {
		// build.gradle.kts is checked before build.gradle by the
		// dispatch order; verify the kts file wins.
		const dir = mkdtempSync(join(TMP, 'both-'));
		writeFileSync(join(dir, 'build.gradle.kts'),
			'dependencies { implementation("a:b:1.0") }');
		writeFileSync(join(dir, 'build.gradle'),
			"dependencies { implementation 'should:not:appear' }");
		const deps = parseManifest(dir);
		assert.equal(deps.length, 1);
		assert.equal(deps[0]?.name, 'a:b');
	});
});

// ---------------------------------------------------------------------------
// SBT build.sbt
// ---------------------------------------------------------------------------

describe('parseManifest - SBT', () => {
	it('extracts %%-style (Scala) and %-style (Java) triples', () => {
		const dir = withFixture('build.sbt', `
name := "demo"
scalaVersion := "3.3.0"

libraryDependencies ++= Seq(
  "org.scalatest" %% "scalatest" % "3.2.18" % Test,
  "com.typesafe" % "config" % "1.4.3"
)
libraryDependencies += "io.circe" %% "circe-core" % "0.14.6"
`);
		const deps = parseManifest(dir);
		const map = new Map(deps.map(d => [d.name, d.version]));
		// %% => artifact suffixed with `_<scala>` placeholder.
		assert.equal(map.get('org.scalatest:scalatest_<scala>'), '3.2.18');
		assert.equal(map.get('io.circe:circe-core_<scala>'), '0.14.6');
		// % => exact artifact name, no suffix.
		assert.equal(map.get('com.typesafe:config'), '1.4.3');
	});
});

// ---------------------------------------------------------------------------
// Mill build.sc
// ---------------------------------------------------------------------------

describe('parseManifest - Mill', () => {
	it('extracts ivy"group::artifact:version" + ivy"group:artifact:version"', () => {
		const dir = withFixture('build.sc', `
import mill._, scalalib._

object app extends ScalaModule {
  def scalaVersion = "3.3.0"
  def ivyDeps = Agg(
    ivy"org.scalatest::scalatest:3.2.18",
    ivy"com.typesafe:config:1.4.3"
  )
}
`);
		const deps = parseManifest(dir);
		const map = new Map(deps.map(d => [d.name, d.version]));
		assert.equal(map.get('org.scalatest:scalatest_<scala>'), '3.2.18');
		assert.equal(map.get('com.typesafe:config'), '1.4.3');
	});
});

// ---------------------------------------------------------------------------
// No manifest -> empty array
// ---------------------------------------------------------------------------

describe('parseManifest - no manifest', () => {
	it('returns an empty array when no manifest is found', () => {
		const dir = mkdtempSync(join(TMP, 'empty-'));
		assert.deepEqual(parseManifest(dir), []);
	});
});
