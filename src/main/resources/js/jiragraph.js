(function ($) {

    var qs = {}; // parsed query-string
    var jiraTicket = undefined;
    var jiraTicketRegExp = undefined;
    var refreshHolder = {};
    var bbRefreshesPilingUp = 0;
    var bbLastRefresh = Date.now() - 12345;
    var bbCurrentRepo = undefined;
    var bbCurrentProj = undefined;

    // replaced with getData() once it's available, otherwise just a no-op.
    refreshHolder.bbRefresh = function () {
        console.log("OLD REFRESH");
    };

    var commitRegex = /reverts commit ([A-Fa-f0-9]{40})/g;
    var svgNS = "http://www.w3.org/2000/svg";
    var xlinkNS = "http://www.w3.org/1999/xlink";
    var svgHolder = Object.create(null);
    svgHolder.commitsList = [];
    svgHolder.reverts = Object.create(null);

    function getOffset(el) {
        el = el && el.getBoundingClientRect();
        var scrollX = Number(window.scrollX || window.pageXOffset || 0);
        var scrollY = Number(window.scrollY || window.pageYOffset || 0);
        return el && {
                left: (el.left),
                top: (el.top)
            };
    }

    function clear(svgHolder, doIt) {
        var tblData = document.getElementById('commits-table');
        while (tblData && tblData.firstChild) {
            tblData.removeChild(tblData.firstChild);
        }

        if (svgHolder) {
            svgHolder.commitsList.length = 0;
            for (k in svgHolder.reverts) {
                delete svgHolder.reverts[k];
            }
        }

        if (doIt) {
            for (var k in doIt.commitsTable) {
                delete doIt.commitsTable[k];
            }
        }
    }

    function redrawSvg(json) {
        var loadingTbl = document.getElementById('bit-booster-loading');
        if (loadingTbl) {
            loadingTbl.parentNode.removeChild(loadingTbl);
        }

        var pre = document.createElement("pre");
        pre.style.display = "none";
        pre.style.position = "fixed";
        pre.style.top = "500px";
        pre.style.left = "500px";
        pre.style.zIndex = "999";
        pre.style.whiteSpace = "pre-line";

        var svg = document.createElementNS(svgNS, "svg");
        var now = Math.floor((new Date).getTime() / 1000);
        svg.setAttribute("now", now);
        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        svg.setAttribute("width", 65);
        svg.setAttribute("height", 80);
        svg.setAttribute("text-rendering", "optimizeLegibility");
        svg.setAttributeNS("http://www.w3.org/1999/xhtml", "style", "border: 0px; margin: 0px; padding: 0;");
        svg.id = "bit-booster";
        svgHolder.svg = svg;

        function makeStop(percent, opacity) {
            var stop = document.createElementNS(svgNS, "stop");
            stop.setAttribute("offset", percent);
            stop.setAttribute("stop-color", "#ffffff");
            stop.setAttribute("stop-opacity", opacity);
            return stop;
        }

        var defs = document.createElementNS(svgNS, "defs");
        var lg = document.createElementNS(svgNS, "linearGradient");
        lg.id = "grad1";
        lg.setAttribute("x1", "0");
        lg.setAttribute("y1", "0");
        lg.setAttribute("x2", "0");
        lg.setAttribute("y2", "1");
        lg.appendChild(makeStop("0%", "0.0"));
        lg.appendChild(makeStop("32%", "1.0"));
        lg.appendChild(makeStop("68%", "1.0"));
        lg.appendChild(makeStop("100%", "0.0"));
        defs.appendChild(lg);
        svg.appendChild(defs);

        var devStatusPanel = document.getElementById("viewissue-devstatus-panel");
        var tbl = document.getElementById("bit-booster-tbl");
        if (!tbl) {
            var div = devStatusPanel;
            var nl = div.childNodes;
            for (var i = 0; i < nl.length; i++) {
                if (nl.item(i).className === 'mod-content') {
                    div = nl.item(i);
                    break;
                }
            }

            tbl = document.createElement('table');
            tbl.setAttribute('cellspacing', 0);
            tbl.setAttribute('cellpadding', 0);
            tbl.id = "bit-booster-tbl";
            var tr = tbl.insertRow();
            var tdTop = tr.insertCell();
            tdTop.setAttribute("colspan", 3);
            tdTop.id = 'bbtdTop';

            if (json && json.err) {
                var bbErr = document.getElementById('bbErr');
                if (!bbErr) {
                    var errRow = tbl.insertRow();
                    bbErr = errRow.insertCell();
                    bbErr.id = 'bbErr';
                    bbErr.setAttribute("colspan", "3");
                    bbErr.style = 'color: red';
                }
                bbErr.textContent = json.err;
            }

            tr = tbl.insertRow();
            var tdL = tr.insertCell();
            tdL.id = "bbtdL";
            var tdR = tr.insertCell();
            tdR.id = "bbtdR";
            var tdZ = tr.insertCell();
            tdZ.id = "bbtdZ";
            tdZ.textContent = '\xa0';
            tdL.style.verticalAlign = "top";
            tdR.style.verticalAlign = "top";
            div.insertBefore(tbl, div.firstChild);
            tdL.appendChild(svg);
            svgHolder.tdL = tdL;
            svgHolder.tdR = tdR;

            var tblData = document.createElement('table');
            tblData.setAttribute('cellspacing', 0);
            tblData.setAttribute('cellpadding', 0);
            tblData.id = "commits-table";
            tdR.appendChild(tblData);

        } else {
            if (!svgHolder.tdL) {
                var cells = tbl.getElementsByTagName("td");
                svgHolder.tdL = cells.item(0);
                svgHolder.tdR = cells.item(1);
            }
            svgHolder.tdL.appendChild(svg);
        }

        var bbPre = document.getElementById("bbPre");
        if (!bbPre) {
            devStatusPanel.appendChild(pre);
            pre.id = "bbPre";
        }

        var bbGraphControl = document.getElementById("bbGraphControl");
        if (!bbGraphControl) {
            var bbControlRow = tbl.insertRow();
            bbGraphControl = bbControlRow.insertCell();
            bbGraphControl.id = 'bbGraphControl';
            var bbRepo = json.currentRepo.repo;
            var bbProj = json.currentRepo.proj;
            var shrinkUrl = json.bitbucket + '/plugins/servlet/bb_net/projects/' + bbProj + '/repos/' + bbRepo + '/commits?bb=Hpdhrt&fromJira=y&grep=false&jira=' + jiraTicket;
            bbGraphControl.innerHTML = '<a href=' + shrinkUrl + '>View full graph</a>';
            var bbPoweredBy = bbControlRow.insertCell();
            bbPoweredBy.setAttribute("colspan", "2");
            bbPoweredBy.id = 'bbPoweredBy';
            bbPoweredBy.innerHTML = "Powered by <a href='https://marketplace.atlassian.com/plugins/com.bit-booster.bb.jira/server/overview'>Bit-Booster</a>";
        } else {
            shrinkUrl = window.location.href.replace('grep=false', 'grep=true');
            bbGraphControl.innerHTML = '<a href=' + shrinkUrl + '>View full graph</a>';
        }
    }

    function f() {

        // http://stackoverflow.com/questions/9229645/remove-duplicates-from-javascript-array/9229821
        function uniq(a) {
            return a.sort().filter(function (item, pos, ary) {
                return !pos || item != ary[pos - 1];
            })
        }

        var COLORS = [
            "#034f84", "#79c753", "#f7786b", "#fae03c", "#98ddde", "#9896a4", "#dc4132", "#b08e6a", "#91a8d0", "#f7cac9"
        ];
        var dateOptionsLong = {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric'
        };
        var dateOptionsShort = {
            year: 'numeric', month: 'short', day: 'numeric'
        };
        var laneWidth = 15;
        var laneLength = 35;
        var maxCol = 0;
        var elbows = [];
        var commitsTable = Object.create(null);
        var farLeftPosition = 9;

        var doIt = function () {
            elbows = [];
        }

        function storeElbow(x, y, commit) {
            if (!elbows[x]) {
                elbows[x] = [];
            }
            elbows[x][y] = commit;
        }

        function readElbow(x, y) {
            return elbows[x] && elbows[x][y];
        }


        function isMerge(my) {
            return my.parents && my.parents.length > 1;
        }

        function addGraphFunctions(my) {
            var commitsList = svgHolder.commitsList;
            var me = my;
            my.pathsDrawn = Object.create(null);

            if (my.drawPathTo) {
                return;
            }

            my.drawPathTo = function (commit) {
                if (my.pathsDrawn[commit.sha1]) {
                    return;
                }
                my.pathsDrawn[commit.sha1] = true;

                var offset = commit.col - my.col;
                var targetCol = my.col;
                if (offset > 0) {
                    targetCol += offset;
                }

                var distance = commit.row - my.row;

                // Collision avoidance:
                var hasCollision = false;
                var collisionFree = false;
                while (!collisionFree) {
                    var foundCollision = false;
                    for (var j = 1; j < distance; j++) {
                        var c = commitsList[my.row + j];
                        if (targetCol === c.col) {
                            hasCollision = true;
                            foundCollision = true;
                            targetCol++;
                            break;
                        }
                        var elbow = readElbow(my.row + j, targetCol);
                        if (elbow && elbow !== commit) {
                            hasCollision = true;
                            foundCollision = true;
                            targetCol++;
                            break;
                        }
                    }
                    if (!foundCollision) {
                        collisionFree = true;
                    }
                }

                var pos = my.pos(commit);
                if (hasCollision) {
                    maxCol = Math.max(maxCol, targetCol);

                    // Two ways to avoid collision:
                    // 1.) curve-around
                    // 2.) move myself over!
                    elbow = readElbow(my.row, targetCol);
                    if (isMerge(me) || (elbow && elbow !== me)) {
                        pos.setColor(targetCol);
                        my.curveRight(pos, targetCol - my.col, commit);
                    } else {
                        my.col = targetCol;
                        my.x = farLeftPosition + (laneWidth * my.col);
                        offset = commit.col - my.col;
                        pos = my.pos(commit);
                    }
                    pos.setColor(targetCol);

                    my.path(pos, commit.row - 1, targetCol, commit);
                    my.curveLeft(pos, commit.col - targetCol, commit);
                    commit.colorOverride = targetCol;
                } else {
                    if (offset > 0) {
                        my.curveRight(pos, offset, commit);
                        my.path(pos, commit.row, targetCol, commit);
                    } else if (offset < 0) {
                        my.path(pos, commit.row - 1, targetCol, commit);
                        my.curveLeft(pos, offset, commit);
                    } else {
                        my.path(pos, commit.row, targetCol, commit);
                    }
                }
            }

            my.plumb = function () {
                var commitsList = svgHolder.commitsList;
                if (my.isPlumbed) {
                    return;
                }
                var result = undefined;
                if (my.parents && my.parents.length > 0) {
                    for (var i = 0; i < my.parents.length; i++) {
                        var parent = commitsTable[my.parents[i]];
                        if (parent && !parent.isPlumbed) {

                            if (i == 0) {
                                result = parent.plumb();
                            } else {
                                parent.plumb();
                            }

                            var offset = parent.col - my.col;
                            var distance = parent.row - my.row;

                            if (offset === 0) {
                                offset = i;
                            }
                            if (offset >= 0) {
                                var col = my.col + offset;
                            } else {
                                col = my.col;
                            }


                            for (var j = 1; j < distance; j++) {
                                var c = commitsList[my.row + j];
                                if (c && !c.isPlumbed) {
                                    c.col = col + 1;
                                    c.x = farLeftPosition + (laneWidth * c.col);
                                    maxCol = Math.max(c.col, maxCol);
                                }
                            }
                        } else {
                            if (i == 0) {
                                result = me;
                            }
                        }
                    }
                } else {
                    result = me;
                }
                my.isPlumbed = true;
                return result;
            }

            my.draw = function () {
                if (my.isDone) {
                    return;
                }
                my.isDone = true;
                for (var i = 0; my.parents && i < my.parents.length; i++) {
                    var parent = commitsTable[my.parents[i]];
                    if (parent) {
                        my.drawPathTo(parent);
                        parent.draw();
                    } else {
                        // Merge-out..
                        my.path(my.pos(), my.row + 1, my.col, undefined, true);
                    }
                }
            }

            my.pos = function (targetCommit) {
                var commitsList = svgHolder.commitsList;
                var v = [my.x, my.y];
                v.setColor = function (col) {
                    if (Number(col) === col) {
                        v.color = COLORS[col % COLORS.length];
                        v.srcColor = v.color;
                    }
                }
                v.setColor(targetCommit && targetCommit.col);
                v.srcColor = COLORS[my.col % COLORS.length];
                if (!v.color) {
                    v.color = v.srcColor;
                }
                if (my.colorOverride) {
                    if (my.col !== 0) {
                        v.setColor(my.colorOverride);
                    }
                }

                v.below = function (targetRow) {
                    var c = commitsList[targetRow];
                    var y = c && c.y;
                    if (!y) {
                        y = commitsList[commitsList.length - 1].y + laneLength;
                    }
                    return [v[0], y];
                }
                v.right = function (amount) {
                    w = [v[0] + (laneWidth * amount), v[1] + laneLength];      // destination
                    if (targetCommit && commitsList.length > my.row + 1) {
                        w[1] = commitsList[my.row + 1].y;
                    }
                    return [
                        v[0] - 1, v[1] + (laneLength * 0.75),                         // bezier point 1
                        v[0] + (laneWidth * amount) + 1, v[1] + (laneLength * 0.25),  // bezier point 2
                        w[0], w[1]
                    ];
                }
                v.left = function (amount) {
                    return [
                        v[0] + 1, v[1] + (laneLength * 0.75),                         // bezier point 1
                        v[0] + (laneWidth * amount) - 1, v[1] + (laneLength * 0.25),  // bezier point 2
                        v[0] + (laneWidth * amount), targetCommit.y
                    ];
                }
                return v;
            }

            my.curveRight = function (pos, distanceAcross, targetCommit) {
                if (targetCommit) {
                    storeElbow(my.row + 1, my.col + distanceAcross, targetCommit);
                }
                var endPos = pos.right(distanceAcross);
                var path = document.createElementNS(svgNS, "path");
                path.setAttribute("d", "M" + pos.join(",") + "C" + endPos.join(","));
                path.setAttribute("stroke-width", 2);
                path.setAttribute("stroke-opacity", 1);
                path.setAttribute("opacity", 1);
                path.setAttribute("fill", "none");
                path.setAttribute("stroke", pos.color);
                my.drawEarlier(path);
                pos[0] = endPos[endPos.length - 2];
                pos[1] = endPos[endPos.length - 1];
            }

            my.curveLeft = function (pos, distanceAcross) {
                var endPos = pos.left(distanceAcross);
                var path = document.createElementNS(svgNS, "path");
                path.setAttribute("d", "M" + pos.join(",") + "C" + endPos.join(","));
                path.setAttribute("stroke-width", 2);
                path.setAttribute("stroke-opacity", 1);
                path.setAttribute("opacity", 1);
                path.setAttribute("fill", "none");
                path.setAttribute("stroke", pos.srcColor);
                my.drawEarlier(path);
                pos[0] = endPos[endPos.length - 2];
                pos[1] = endPos[endPos.length - 1];
            }

            my.path = function (pos, targetRow, targetCol, targetCommit, dashed) {

                if (dashed && qs['grep'] === 'true') {
                    // The compressed graph skips unconnected merges (aka "dashed lines").
                    return;
                }

                var svg = svgHolder.svg;
                var commitsList = svgHolder.commitsList;

                // Every moment of collision-avoidance must be marked as an "elbow":
                if (!dashed && targetCommit) {
                    for (var i = my.row + 1; i < targetRow; i++) {
                        storeElbow(i, targetCol, targetCommit);
                    }
                }

                var path = document.createElementNS(svgNS, "path");
                var endPos = pos.below(targetRow);

                if (dashed && my.row !== commitsList.length - 1) {
                    // dashed should trail off after 70% of distance..
                    endPos[0] = pos[0] + laneWidth * 1.5;
                    endPos[1] = pos[1] + 0.7 * (endPos[1] - pos[1]);
                }

                path.setAttribute("d", "M" + pos.join(",") + "L" + endPos.join(","));
                path.setAttribute("stroke-width", 2);
                path.setAttribute("stroke-opacity", 1);
                if (dashed) {
                    path.setAttribute("stroke-dasharray", "15,3,3,3,3,3,3,3,3,3,3");
                }
                path.setAttribute("opacity", 1);
                if (targetCommit && targetCommit.col && my.col < targetCommit.col) {
                    path.setAttribute("stroke", pos.color);
                } else {
                    path.setAttribute("stroke", pos.srcColor);
                }
                svg.appendChild(path);
                pos[1] = endPos[1];

                var width = svg.getAttribute("width");
                if (width < pos[0]) {
                    svg.setAttribute("width", Math.ceil(pos[0] + 7) + "");
                }
            }

            my.drawEarlier = function (element) {
                var svg = svgHolder.svg;
                if (svg.firstChild) {
                    svg.insertBefore(element, svg.firstChild);
                } else {
                    svg.appendChild(element);
                }
            }

            my.circle = function () {
                var url = window.location.href;
                var x = url.lastIndexOf("/plugins/servlet/bb_net/");
                var y = url.lastIndexOf("/projects/");
                var target = "";
                if (x >= 0 && y >= 0) {
                    target = url.substr(0, x) + url.substr(y);
                    target += (target.indexOf('?') > y) ? '&' : '?';
                }

                var pos = my.pos();
                var svg = svgHolder.svg;
                var width = svg.getAttribute("width");
                var height = svg.getAttribute("height");

                var rect = document.createElementNS(svgNS, "rect");
                rect.id = "R_" + my.sha1;
                rect.setAttribute("x", 0);
                rect.setAttribute("y", Number(pos[1] - 14));
                rect.setAttribute("width", "100%");
                rect.setAttribute("height", 28);
                rect.setAttribute("stroke", "none");
                rect.setAttribute("stroke-width", 0);
                rect.setAttribute("fill", "transparent");

                var circle = document.createElementNS(svgNS, "circle");
                circle.id = "C_" + my.sha1;
                circle.setAttribute("cx", pos[0]);
                circle.setAttribute("cy", pos[1]);
                circle.setAttribute("r", 4);
                if (my.bbMatch) {
                    circle.setAttribute("fill", "red");
                } else {
                    circle.setAttribute("fill", !my.revert ? "black" : (my.revert === 1 ? "red" : "orange"));
                }
                circle.setAttribute("stroke", "none");

                if (my.revert) {
                    var c1 = [pos[0] - 6, pos[1] - 6];
                    var c2 = [pos[0] + 6, pos[1] - 6];
                    var c3 = [pos[0] - 6, pos[1] + 6];
                    var c4 = [pos[0] + 6, pos[1] + 6];
                    var xL = document.createElementNS(svgNS, "path");
                    xL.setAttribute("d", "M" + c1.join(",") + "L" + c4.join(","));
                    xL.setAttribute("stroke-width", 3);
                    xL.setAttribute("stroke-opacity", 1);
                    xL.setAttribute("opacity", 1);
                    xL.setAttribute("stroke", my.revert === 1 ? "red" : "orange");
                    svg.appendChild(xL);

                    var xR = document.createElementNS(svgNS, "path");
                    xR.setAttribute("d", "M" + c2.join(",") + "L" + c3.join(","));
                    xR.setAttribute("stroke-width", 3);
                    xR.setAttribute("stroke-opacity", 1);
                    xR.setAttribute("opacity", 1);
                    xR.setAttribute("stroke", my.revert === 1 ? "red" : "orange");
                    svg.appendChild(xR);
                }

                if (true || window.location.pathname.indexOf("/bb_net/") >= 0) {
                    var hasTags = my.tags && my.tags.length > 0;
                    var hasBranches = my.branches && my.branches.length > 0;
                    var hasBoth = hasTags && hasBranches;
                    var insertBefore = undefined;
                    if (hasBranches) {
                        insertBefore = my.insertTag(pos, false, hasBoth, target);
                    }
                    if (hasTags) {
                        my.insertTag(pos, true, hasBoth, target, insertBefore);
                    }
                }


                svg.appendChild(rect); // append it after the tags/branches so hover works
                svg.appendChild(circle);
                jqueryEnterAndLeave(svg, rect);
                jqueryEnterAndLeave(svg, circle);

                if (width < pos[0]) {
                    svg.setAttribute("width", Math.ceil(pos[0] + 7) + "");
                }
                if (height < pos[1]) {
                    svg.setAttribute("height", pos[1] + 10);
                }
            }

            function jqueryEnterAndLeave(svg, svgObj) {
                $(svgObj).mouseenter(function () {
                    sha = this.id.substring(2);
                    var hit = $("#T_" + sha).addClass("commitHover");
                    drawCommitHover(hit[0], svg, me);
                }).mouseleave(function () {
                    document.getElementById("bbPre").style.display = "none";
                    sha = this.id.substring(2);
                    $("#T_" + sha).removeClass("commitHover");
                });
            }

            function truncateBranch(branch) {
                if (branch.length > 19) {
                    return branch.substr(0, 16) + "...";
                } else {
                    return branch;
                }
            }

            my.insertTag = function (pos, isTag, hasBoth, target, insertBefore) {
                var svg = svgHolder.svg;
                var posCopy = pos;
                pos = [posCopy[0], posCopy[1]];
                if (hasBoth) {
                    pos[1] += isTag ? -7 : 7;
                }
                var width = svg.getAttribute("width");
                var text = document.createElementNS(svgNS, "text");
                var objs = isTag ? my.tags : my.branches;

                // Copy "objs" and remove all "HEAD" refs from it.
                objs = objs.slice();
                for (var i = objs.length - 1; i >= 0; i--) {
                    var o = objs[i];
                    if (o.indexOf('HEAD ->') === 0) {
                        o = o.substr(7).trim();
                        objs[i] = o;
                    }
                    if (o === 'HEAD' || o.indexOf('HEAD ') === 0) {
                        objs.splice(i, 1);
                    }
                }

                text.setAttribute("x", pos[0] + 7);
                text.setAttribute("y", pos[1] + 3);
                text.setAttribute("font-size", "12px");
                text.textContent = truncateBranch(objs[0]);

                var links = [text];
                // links.push(document.createElementNS(svgNS, "a"));
                // links[0].setAttributeNS(xlinkNS, "href", target + "until=" + objs[0]);
                // links[0].setAttributeNS(xlinkNS, "title", objs[0]);
                // links[0].appendChild(text);
                svg.appendChild(links[0]);

                if (isTag && !my.tagBox1) {
                    var bbox = links[0].getBBox();
                    my.tagBox1 = {
                        width: bbox.width,
                        height: bbox.height
                    };
                }
                if (!isTag && !my.brBox1) {
                    bbox = links[0].getBBox();
                    my.brBox1 = {
                        width: bbox.width,
                        height: bbox.height
                    };
                }

                var box = {
                    width: isTag ? my.tagBox1.width : my.brBox1.width,
                    height: isTag ? my.tagBox1.height : my.brBox1.height
                };

                if (objs.length > 1) {
                    text = document.createElementNS(svgNS, "text");
                    text.setAttribute("x", pos[0] + 6 + box.width);
                    text.setAttribute("y", pos[1] + 2);
                    text.setAttribute("font-size", "12px");
                    text.textContent = ", ";
                    svg.appendChild(text);

                    text = document.createElementNS(svgNS, "text");
                    text.setAttribute("x", pos[0] + 12 + box.width);
                    text.setAttribute("y", pos[1] + 3);
                    text.setAttribute("font-size", "12px");

                    // links.push(document.createElementNS(svgNS, "a"));
                    if (objs.length == 2) {
                        text.textContent = truncateBranch(objs[1]);
                        // links[1].setAttributeNS(xlinkNS, "href", target + "until=" + objs[1]);
                        // links[1].setAttributeNS(xlinkNS, "title", objs[1]);
                    } else {
                        text.textContent = '[' + (objs.length - 1) + " more " + (isTag ? "tags" : "branches") + "]";
                        // links[1].setAttribute("class", "noUnderline");
                        // links[1].setAttributeNS(xlinkNS, "title", objs.slice(1).join(", "));
                    }
                    // links[1].appendChild(text);

                    links[1] = text; // let's not be clickable for now...

                    svg.appendChild(links[1]);

                    if (isTag && !my.tagBox2) {
                        bbox = links[1].getBBox();
                        my.tagBox2 = {
                            width: bbox.width,
                            height: bbox.height
                        };
                    }
                    if (!isTag && !my.brBox2) {
                        bbox = links[1].getBBox();
                        my.brBox2 = {
                            width: bbox.width,
                            height: bbox.height
                        };
                    }

                    var box2 = {
                        width: isTag ? my.tagBox2.width : my.brBox2.width,
                        height: isTag ? my.tagBox2.height : my.brBox2.height
                    };
                    box.width = box.width + box2.width + 4;
                    box.height = box2.height;
                }

                if (!hasBoth || (hasBoth && isTag)) {
                    rect = document.createElementNS(svgNS, "rect");
                    var boxWidth = box.width;
                    if (insertBefore) {
                        boxWidth = Math.max(boxWidth, insertBefore.boxWidth);
                    }
                    rect.setAttribute("x", pos[0] + 6);
                    rect.setAttribute("y", pos[1] - 16);
                    rect.setAttribute("rx", hasBoth ? "15" : "20");
                    rect.setAttribute("ry", hasBoth ? "15" : "20");
                    rect.setAttribute("width", boxWidth + 24);
                    rect.setAttribute("height", box.height + 17 + (hasBoth ? 15 : 0));
                    rect.setAttribute("stroke", "none");
                    rect.setAttribute("fill", "url(#grad1)");
                    rect.setAttribute("opacity", "1.0");
                    svg.insertBefore(rect, (insertBefore && insertBefore.domNode) || links[0]);
                }

                var icon = document.createElementNS(svgNS, "text");
                icon.setAttribute("font-family", "Atlassian Icons");
                icon.setAttribute("class", "icon");
                icon.setAttribute("x", pos[0] + box.width + 7 + (isTag ? 1 : 0));
                icon.setAttribute("y", pos[1] + 4);
                icon.textContent = isTag ? "\uf13b" : "\uf128";
                svg.appendChild(icon);

                if (width < pos[0] + 25 + box.width) {
                    svg.setAttribute("width", Math.ceil(pos[0] + box.width + 27) + "");
                    width = pos[0] + box.width + 30;
                }
                return {domNode: links[0], boxWidth: box.width};
            }
        }

        function parseDecorations(decs) {
            var tags = [];
            var branches = [];
            var toks = decs.split(", ");
            for (var i = 0; i < toks.length; i++) {
                var tok = toks[i];
                if (tok.indexOf("tag: ") == 0) {
                    tags.push(tok.substr(5));
                } else {
                    if (tok.indexOf("refs/pull-requests/") >= 0) {
                        // do nothing
                    } else {
                        branches.push(tok);
                    }
                }
            }
            return [uniq(tags), uniq(branches)];
        }

        function g(json) {

            function extractIds(s) {
                function reverse(s) {
                    for (var i = s.length - 1, o = ''; i >= 0; o += s[i--]) {
                    }
                    return o;
                }

                var jira_matcher = /\d+-[A-Z]+(?!-?[a-zA-Z]{1,10})/g
                var r = reverse(s)
                var matches = r.match(jira_matcher)
                if (!matches) {
                    matches = []
                }
                for (var j = 0; j < matches.length; j++) {
                    var m = reverse(matches[j])
                    matches[j] = m.replace(/-0+/, '-') // trim leading zeroes:  ABC-0123 becomes ABC-123
                }

                // need to remove duplicates, since they will cause n^2 links to be created (n = dups).
                return uniq(matches);
            }

            var repos = json.repos;
            var reposCount = {};
            for (i = 0; i < repos.length; i++) {
                var r = repos[i].repo;
                if (reposCount[r]) {
                    reposCount[r]++;
                } else {
                    reposCount[r] = 1;
                }
            }


            var currentRepo = json.currentRepo.repo;
            var currentProj = json.currentRepo.proj;
            var bbTdTop = document.getElementById('bbtdTop');
            while (bbTdTop.firstChild) {
                bbTdTop.removeChild(bbTdTop.firstChild);
            }
            var tbl = document.createElement("table");
            tbl.setAttribute("cellspacing", 0);
            tbl.setAttribute("cellpadding", 0);
            var topTr = tbl.insertRow();
            var leftCell = topTr.insertCell();
            leftCell.className = 'bbBottom'
            leftCell.textContent = ' ';

            function drawTab(r) {
                var topCell = topTr.insertCell();
                if (r.repo === currentRepo && r.proj === currentProj) {
                    topCell.className = 'selected';
                } else {
                    topCell.onclick = function () {
                        refreshHolder.bbRefresh(r.proj, r.repo);
                        return false;
                    };
                }
                var rCount = reposCount[r.repo];
                var rContent = r.repo + ' (' + r.hits + ')';
                if (rCount > 1) {
                    topCell.innerHTML = r.proj + '/<br/>' + rContent;
                } else {
                    topCell.textContent = rContent;
                }
            }

            function addOption(select, r) {
                var option = document.createElement('option');
                if (r.repo === currentRepo && r.proj === currentProj) {
                    option.setAttribute('selected', 'selected');
                    option.className = 'selected';

                    $(select).addClass('selected');
                    $(select.parentNode).addClass('selected');
                }

                var rCount = reposCount[r.repo];
                var rContent = r.repo + ' (' + r.hits + ')';
                if (rCount > 1) {
                    rContent = r.proj + '/' + rContent;
                }
                option.setAttribute('value', rContent);
                option.setAttribute('bbProj', r.proj);
                option.setAttribute('bbRepo', r.repo);
                option.textContent = rContent;
                select.appendChild(option);
            }

            for (i = 0; i < Math.min(2, repos.length); i++) {
                drawTab(repos[i]);
            }
            if (repos.length == 3) {
                drawTab(repos[2]);
            } else if (repos.length > 3) {
                var topCell = topTr.insertCell();
                topCell.className = 'bbSelect';
                var select = document.createElement('select');
                topCell.appendChild(select);
                var option = document.createElement('option');
                option.setAttribute('value', '');
                option.textContent = 'More...';
                select.appendChild(option);
                select.onchange = function () {
                    var x = select.selectedIndex;
                    var selectedOption = select.options[x];
                    selectedOption.className = 'selected';
                    select.selectedIndex = 0;
                    var proj = undefined;
                    var repo = undefined;
                    if (selectedOption.hasAttribute('bbProj')) {
                        var proj = selectedOption.getAttribute('bbProj');
                        var repo = selectedOption.getAttribute('bbRepo');
                    }
                    refreshHolder.bbRefresh(proj, repo);
                    select.selectedIndex = x;
                    return false;
                };

                for (i = 2; i < repos.length; i++) {
                    addOption(select, repos[i]);
                }
            }

            var rightCell = topTr.insertCell();
            rightCell.className = 'bbBottom';
            rightCell.textContent = ' ';
            bbTdTop.appendChild(tbl);

            clear(svgHolder, doIt);

            var jira = json.jira;
            var lines = json.lines;
            var now = Math.floor((new Date).getTime() / 1000);

            // Add the divider line if we have valid graph data.
            if (lines.length > 0) {
                var d = document.getElementById('devstatus-container');
                if (d.className.indexOf('bbTop') < 0) {
                    $(d).addClass('bbTop');
                }
            }
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var sha1 = line[2];
                var hasParents = line.length > 3 && line[3] && ("" !== line[3].trim());
                var parents = hasParents ? line[3].trim().split(' ') : undefined;
                var commitsList = svgHolder.commitsList;

                var tblData = document.getElementById('commits-table');
                var tr = tblData.insertRow();
                tr.id = 'T_' + sha1;
                tr.setAttribute('data-commitid', sha1);

                // Authors
                var td = tr.insertCell();
                td.textContent = line[5];
                td.className = 'bbAuthor';

                // Dates
                td = tr.insertCell();
                td.className = 'bbTime';
                var time = document.createElement('time');
                var unixTime = Number(line[0]);
                var date = new Date(unixTime * 1000);
                var dateShort = date.toLocaleDateString(undefined, dateOptionsShort);
                var dateLong = date.toLocaleDateString(undefined, dateOptionsLong);
                var timeString = date.toLocaleTimeString();
                if (dateShort === dateLong) {
                    dateLong = dateShort + " " + timeString;
                }
                var dateRfc = date.toISOString();
                if (now - unixTime < 60 * 60 * 24 * 7) {
                    dateShort = line[1];
                }
                time.setAttribute("datetime", dateRfc);
                time.textContent = dateShort;
                td.appendChild(time);

                var svgPos = getOffset(svgHolder.svg);
                var offset = getOffset(time);
                var c = {
                    isDone: false,
                    isPlumbed: false,
                    sha1: sha1,
                    x: farLeftPosition,
                    y: 8 + offset.top - svgPos.top,
                    row: commitsList.length,
                    col: 0,
                    htmlElement: time,
                    author: line[5],
                    msg: line[6],
                    bbMatch: line.length > 7 && line[7],
                    date: dateLong
                };

                var tkt = 'AUI-4224';
                c.msg = c.msg.replace(new RegExp(tkt, 'g'), "<b>" + tkt + "</b>");

                commitsList.push(c);
                commitsTable[c.sha1] = c;
                if (hasParents) {
                    c.parents = parents;
                }
                if ("" !== line[4]) {
                    var tagsAndBranches = parseDecorations(line[4]);
                    c.tags = tagsAndBranches[0];
                    c.branches = tagsAndBranches[1];
                }

                var row = document.getElementById("T_" + sha1);
                if (c) {
                    $(row).mouseenter(function () {
                        var svg = document.getElementById("bit-booster");
                        var sha = this.getAttribute("data-commitid");
                        if (sha) {
                            var circle = svg.getElementById("C_" + sha);
                            circle.setAttribute("class", "commitHover");
                            var c = commitsTable[sha];
                            drawCommitHover(this, svg, c);
                        }
                    }).mouseleave(function () {
                        document.getElementById("bbPre").style.display = "none";
                        var svg = document.getElementById("bit-booster");
                        var sha = this.getAttribute("data-commitid");
                        if (sha) {
                            var circle = svg.getElementById("C_" + sha);
                            circle.removeAttribute("class");
                        }
                    });
                }

                if (c && !c.timeSet) {
                    c.timeSet = true;
                }
            }

            for (i = 0; i < commitsList.length; i++) {
                addGraphFunctions(commitsList[i]);
            }

            function isHead(c) {
                if (c.branches && c.branches.length > 0) {
                    for (var i = 0; i < c.branches.length; i++) {
                        var b = c.branches[i];
                        if (b === "HEAD" || b.indexOf("HEAD ") === 0) {
                            return true;
                        }
                    }
                }
                return false;
            }

            var head = undefined;
            for (i = 0; i < commitsList.length; i++) {
                c = commitsList[i];
                if (isHead(c)) {
                    head = c;
                    break;
                }
            }

            for (i = 0; i < (head ? head.row : commitsList.length); i++) {
                c = commitsList[i];
                c.col++;
                c.x = farLeftPosition + (laneWidth * c.col);
            }

            if (head) {
                var tail = head.plumb();
                if (tail) {
                    for (i = tail.row + 1; i < commitsList.length; i++) {
                        c = commitsList[i];
                        if (c.col === 0) {
                            c.col++;
                            c.x = farLeftPosition + (laneWidth * c.col);
                        }
                    }
                }
            }

            var revertsGuaranteed = window.location.pathname.indexOf('/bb_net/') < 0;
            for (i = 0; i < commitsList.length; i++) {
                c = commitsList[i];

                row = document.getElementById("T_" + c.sha1);
                if (row && row.className.indexOf("revert") < 0) {
                    var revertCommit = svgHolder.reverts[c.sha1];
                    var revert = revertCommit && (revertsGuaranteed || revertCommit.col === 0);
                    var revertMaybe = !revert && revertCommit;
                    if (revert) {
                        row.className += " revert";
                    } else if (revertMaybe) {
                        row.className += " revertMaybe";
                    }

                    nl = row.getElementsByTagName("td");
                    td = undefined;
                    for (j = 0; j < nl.length; j++) {
                        td = nl.item(j);
                        if (td.className.indexOf("message") >= 0) {
                            break;
                        }
                    }
                    if (td) {
                        nl = td.getElementsByTagName("span");
                        for (j = 0; j < nl.length; j++) {
                            var span = nl.item(j);
                            if (span.className.indexOf("message-subject") >= 0) {
                                var b;
                                if (revertMaybe) {
                                    b = document.createElement("b");
                                    b.textContent = "Possibly Reverted: ";
                                    span.parentNode.insertBefore(b, span);
                                    c.revert = 2;
                                } else if (revert) {
                                    b = document.createElement("b");
                                    b.textContent = "Reverted: ";
                                    span.parentNode.insertBefore(b, span);
                                    c.revert = 1;
                                } else {
                                    var title = span.title;
                                    var m = commitRegex.exec(title);
                                    while (m) {
                                        if (m[1]) {
                                            svgHolder.reverts[m[1]] = c;
                                        }
                                        m = commitRegex.exec(title);
                                    }
                                }
                            }
                        }
                    }
                }

                commitsList[i].plumb();

            }
            for (i = commitsList.length - 1; i >= 0; i--) {
                commitsList[i].draw();
            }
            for (i = commitsList.length - 1; i >= 0; i--) {
                commitsList[i].circle();
            }
        }

        doIt.g = g;
        doIt.commitsTable = commitsTable;
        return doIt;
    }

    function drawCommitHover(hit, svg, c) {
        var hitOffset = getOffset(hit);
        var svgOffset = getOffset(svg);
        var left = svgOffset.left;
        var top = hitOffset.top;
        var bbPre = document.getElementById("bbPre");
        top = (Math.round(top - 5)) + "px";
        left = (Math.round(left) - 403) + "px";
        if (bbPre) {
            bbPre.style.display = "block";
            bbPre.style.top = top;
            bbPre.style.left = left;

            var preText = 'Id: ' + c.sha1 + '\nDate: ' + c.date + '\nAuthor: ' + c.author;
            if (c.tags) {
                preText += '\nTags: ' + c.tags;
            }
            bbPre.innerHTML = preText + '\n\n' + c.msg;
        }
    }

    window.addEventListener("load", function load(event) {
            window.removeEventListener("load", load);

            require(['jira/devstatus/dev-status-module'], function (devStatusModule) {
                var doIt = f(event);

                function firstCommitWithN() {
                    return "HEAD?n=3";
                }

                function drawGraph() {
                    bbRefreshesPilingUp = 0;
                    doIt();
                    var svg = document.getElementById("bit-booster");
                    if (svg) {
                        svg.parentNode.removeChild(svg);
                    }

                    if (this.responseText.indexOf("bit-booster plugin requires a license") >= 0) {
                        redrawSvg();
                        svg = svgHolder.svg;

                        var expired = document.getElementById("bit-booster-expired");
                        if (!expired) {
                            var a = document.createElement("a");
                            var path = window.location.pathname;
                            var x = path.indexOf("/plugins/servlet/");
                            if (x >= 0) {
                                a.setAttribute("href", path.substring(0, x + "/plugins/servlet/".length) + "upm");
                            } else {
                                a.setAttribute("href", "../plugins/servlet/upm");
                            }
                            a.id = "bit-booster-expired";
                            a.innerHTML = "Bit-Booster<br/>Commit&nbsp;Graph<br/>License<br/>Expired!";
                            var parent = svg.parentNode;
                            parent.insertBefore(a, svg);
                        }
                    } else {
                        var json = JSON.parse(this.responseText);
                        redrawSvg(json);
                        doIt.g(json);
                    }
                }

                function getData(proj, repo) {
                    if (proj && repo) {
                        bbCurrentProj = proj;
                        bbCurrentRepo = repo;
                    }
                    var commitToFetch = firstCommitWithN();
                    if (commitToFetch) {

                        var tbl = document.getElementById('bit-booster-tbl');
                        if (tbl) {
                            var parent = tbl.parentNode;
                            parent.removeChild(tbl);
                            tbl = document.createElement("table");
                            tbl.id = "bit-booster-loading";
                            tbl.style.width = "100%";
                            var row = tbl.insertRow();
                            var cell = row.insertCell();
                            cell.style.paddingTop = "33px";
                            cell.style.paddingBottom = "33px";
                            cell.style.textAlign = "center";
                            cell.style.fontWeight = "bold";
                            cell.textContent = "Loading...";
                            parent.insertBefore(tbl, parent.firstChild);
                        }

                        jiraTicket = JIRA.Issue.getIssueKey();
                        jiraTicketRegExp = new RegExp(jiraTicket, 'g');
                        var url = window.location.pathname;
                        url = "/jira/plugins/servlet/bb_dag" + window.location.pathname + "/?jira=" + jiraTicket;
                        if (bbCurrentProj) {
                            url += '&bbProj=' + bbCurrentProj;
                        }
                        if (bbCurrentRepo) {
                            url += '&bbRepo=' + bbCurrentRepo;
                        }
                        var oReq = new XMLHttpRequest();
                        var now = Date.now();
                        var sinceLastRefresh = now - bbLastRefresh;
                        if (sinceLastRefresh > 500) {
                            bbLastRefresh = now;
                            setTimeout(function () {
                                oReq.addEventListener("load", drawGraph);
                                oReq.open("GET", url);
                                oReq.send();
                            }, 2000);
                        } else {
                            // console.log("NOT DOING REFRESH: " + sinceLastRefresh);
                        }
                    }
                }

                refreshHolder.bbRefresh = getData;

                var checkExist = setInterval(function () {
                    if ($('#viewissue-devstatus-panel').length) {
                        clearInterval(checkExist);

                        var Events = require('jira/util/events');
                        var Types = require('jira/util/events/types');
                        var _ = require('underscore');

                        Events.bind(Types.NEW_CONTENT_ADDED, _.bind(function (e) {
                            if (bbRefreshesPilingUp === 0) {
                                bbRefreshesPilingUp = 1;
                                setTimeout(refreshHolder.bbRefresh, 500);
                            }
                        }, this));
                        Events.bind("GH.DetailView.updated", _.bind(function (e) {
                            if (bbRefreshesPilingUp === 0) {
                                bbRefreshesPilingUp = 1;
                                setTimeout(refreshHolder.bbRefresh, 500);
                            }
                        }, this));

                        refreshHolder.bbRefresh();
                        var x = JIRA.DevStatus.devStatusModule;
                        var devStatus = JIRA.DevStatus.devStatusModule.devStatusData;

                        devStatus.on("beforeRequest", function () {
                            refreshHolder.bbRefresh();
                        });
                    }
                }, 166);
            });
        },
        false
    );
}(jQuery));
