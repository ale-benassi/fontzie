"""Keep the Store submission and the GitHub Release on the same ZIP."""

import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from xml.etree import ElementTree
from zipfile import ZipFile


REPO = "ale-benassi/fontzie"
ITEM = "okieeoellfjeaoppljeooohndgffiojd"
STORE = f"https://chromewebstore.google.com/detail/fontzie/{ITEM}"
VERSION = r"[0-9]+\.[0-9]+\.[0-9]+"


def gh(*args, stdin=None):
    return subprocess.run(
        ["gh", *args], input=stdin, stdout=subprocess.PIPE, text=True, check=True,
    ).stdout.strip()


def releases():
    # The REST endpoint for a single tag omits unpublished drafts.
    endpoint = f"repos/{REPO}/releases?per_page=100"
    pages = json.loads(gh("api", "--paginate", "--slurp", endpoint))
    return {r["tag_name"]: r for page in pages for r in page}


def zip_name(tag):
    return f"fontzie-{tag[1:]}-chrome.zip"


def zip_asset(release):
    name = zip_name(release["tag_name"])
    return next((asset for asset in release["assets"] if asset["name"] == name), None)


def checksum_note(asset):
    digest = asset.get("digest") or ""
    if asset["state"] != "uploaded" or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise ValueError("GitHub has not confirmed the uploaded ZIP and its SHA-256.")
    return f"SHA-256 for `{asset['name']}` is `{digest[7:]}`."


def prepare(tag, commit):
    if not re.fullmatch("v" + VERSION, tag):
        raise ValueError("Invalid release tag")
    archive = Path("store-package") / zip_name(tag)
    release = releases().get(tag)
    if release is None:
        gh("api", f"repos/{REPO}/git/ref/tags/{tag}", "--silent")
        # The release list can lag behind a successful draft creation.
        release = json.loads(gh(
            "api", "--method", "POST", f"repos/{REPO}/releases",
            "-f", f"tag_name={tag}", "-f", f"target_commitish={commit}",
            "-f", f"name=Fontzie {tag[1:]}", "-F", "draft=true",
            "-F", "generate_release_notes=true", "-f", f"body=[Fontzie on the Chrome Web Store]({STORE})",
        ))
    if release["target_commitish"] != commit:
        raise ValueError(f"{tag} points to a different release commit.")

    asset = zip_asset(release)
    if asset is None or (asset["state"] == "starter" and asset["size"] == 0):
        if not release["draft"]:
            raise ValueError(f"The published {tag} has no completed release ZIP.")
        # GitHub may leave an empty starter asset after an interrupted upload.
        if asset:
            gh("api", "--method", "DELETE", asset["url"])
        upload_url = release["upload_url"].split("{", 1)[0]
        asset = json.loads(gh(
            "api", "--method", "POST", f"{upload_url}?{urlencode({'name': archive.name})}",
            "--header", "Content-Type: application/zip", "--input", str(archive),
        ))
    if not asset:
        raise ValueError("The draft has no release ZIP after upload.")
    note = checksum_note(asset)

    def matches(path):
        return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest() == asset["digest"]

    # A full CI retry can rebuild a byte-different ZIP. Reuse the original for Google.
    if not matches(archive):
        with tempfile.TemporaryDirectory(dir=archive.parent) as tmp:
            gh("release", "download", tag, "--repo", REPO, "--pattern", archive.name, "--dir", tmp)
            original = Path(tmp) / archive.name
            if not matches(original):
                raise ValueError("Downloaded ZIP differs from GitHub's checksum.")
            original.replace(archive)
    with ZipFile(archive) as package:
        if json.loads(package.read("manifest.json"))["version"] != tag[1:]:
            raise ValueError("The draft ZIP version differs from its tag.")
    body = release["body"] or ""
    if note not in body:
        if not release["draft"] or f"SHA-256 for `{archive.name}`" in body:
            raise ValueError("The release notes do not match the ZIP checksum.")
        updated = json.loads(gh(
            "api", "--method", "PATCH", release["url"], "--input", "-",
            stdin=json.dumps({"tag_name": tag, "body": f"{body.rstrip()}\n\n{note}\n"}),
        ))
        if updated["tag_name"] != tag:
            raise ValueError(f"GitHub did not retain the release tag {tag}.")
    print(f"Verified {tag} Store package: {asset['digest']}")


def live_version(chrome):
    query = urlencode({
        "response": "updatecheck", "acceptformat": "crx3", "prodversion": chrome,
        "x": f"id={ITEM}&v=0.0.0.0&uc",
    })
    with urlopen(f"https://clients2.google.com/service/update2/crx?{query}", timeout=30) as response:
        root = ElementTree.parse(response)
    update = root.find(f".//{{*}}app[@appid='{ITEM}'][@status='ok']/{{*}}updatecheck[@status='ok']")
    if update is None or not re.fullmatch(VERSION, update.get("version", "")):
        raise ValueError("Chrome did not report a live version for Fontzie.")
    return update.attrib["version"]


def publish_live(chrome):
    drafts = {
        tag: release for tag, release in releases().items()
        if release["draft"] and not release["prerelease"] and re.fullmatch("v" + VERSION, tag)
    }
    if not drafts:
        print("No release drafts are awaiting Store publication.")
        return
    tag = "v" + live_version(chrome)
    print(f"Chrome serves {tag}. Drafts: {', '.join(drafts)}.", flush=True)
    if tag not in drafts:
        return
    release = drafts[tag]
    asset = zip_asset(release)
    if not asset or checksum_note(asset) not in (release["body"] or ""):
        raise ValueError(f"{tag} is live but its draft ZIP or checksum is incomplete.")
    commit = subprocess.check_output(["git", "rev-parse", f"refs/tags/{tag}^{{commit}}"], text=True).strip()
    if release["target_commitish"] != commit:
        raise ValueError(f"The draft commit does not match the {tag} tag.")
    subprocess.run(["git", "merge-base", "--is-ancestor", commit, "HEAD"], check=True)
    print(gh("api", "--method", "PATCH", release["url"], "-f", f"tag_name={tag}",
             "-F", "draft=false", "--jq", ".html_url"))


if __name__ == "__main__":
    if sys.argv[1:2] == ["prepare"] and len(sys.argv) == 4:
        prepare(*sys.argv[2:])
    elif sys.argv[1:2] == ["publish-live"] and len(sys.argv) == 3:
        publish_live(sys.argv[2])
    else:
        sys.exit("Expected prepare TAG COMMIT or publish-live CHROME_VERSION")
