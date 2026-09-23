# Draft only: requires explicit approval and CloudBase validation before saving.
package authz.user

default allow := false

probe if {
    input.cloudbase.env_id == "env-d1g2bv5sn355fc36e"
    input.cloudbase.entrypoint_type == "tcbopenapi"
    input.cloudbase.resource_type == "functions"
    input.request.path == "/v1/functions/xiaoying-gifts-sdk-probe"
    input.request.header_map["Origin"] == "http://127.0.0.1:4194"
}

allow if {
    probe
    input.subject.auth_type == "anonymous"
    input.request.method == "POST"
}

# Preflight has no access token and must not execute a business request.
allow if {
    probe
    input.request.method == "OPTIONS"
}

# An allow=false does not override the platform's default allow policy.
# Auth/session routes are not resource routes and keep platform behavior.
deny contains "SDK probe access only" if {
    input.cloudbase.env_id == "env-d1g2bv5sn355fc36e"
    input.cloudbase.entrypoint_type == "tcbopenapi"
    input.subject.auth_type in {"anonymous", "unauthenticated"}
    input.cloudbase.resource_type in {"functions", "storages", "cloudrun", "ai", "aibot", "model", "rdb", "knowledge"}
    not allow
}
