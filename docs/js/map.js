/* Keele arboretum map — ES5 for older browsers */
(function () {
  var KEELE_FALLBACK = [53.004, -2.267];
  var ZOOM_FALLBACK = 15;

  function getQueryParams() {
    var out = {};
    var q = window.location.search;
    if (!q || q.length < 2) {
      return out;
    }
    var pairs = q.substring(1).split("&");
    for (var i = 0; i < pairs.length; i++) {
      var parts = pairs[i].split("=");
      var k = parts[0] ? decodeURIComponent(parts[0].replace(/\+/g, " ")) : "";
      if (!k) {
        continue;
      }
      var v = parts.length > 1 ? decodeURIComponent(parts.slice(1).join("=").replace(/\+/g, " ")) : "";
      out[k] = v;
    }
    return out;
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) {
      return "";
    }
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function propsToPopupHtml(props) {
    var lines = [];
    if (props.latin_name) {
      lines.push("<strong>" + escapeHtml(props.latin_name) + "</strong>");
    }
    if (props.species) {
      lines.push(escapeHtml(props.species));
    }
    if (props.tag !== undefined && props.tag !== null && props.tag !== "") {
      lines.push("Tag: " + escapeHtml(props.tag));
    }
    if (props.square) {
      lines.push("Square: " + escapeHtml(props.square));
    }
    if (props.planted) {
      lines.push("Planted: " + escapeHtml(props.planted));
    }
    if (props.w3w) {
      lines.push("what3words: " + escapeHtml(props.w3w));
    }
    if (props.comments) {
      lines.push("<span class=\"popup-comments\">" + escapeHtml(props.comments) + "</span>");
    }
    if (props.source_sheet) {
      lines.push("<span class=\"popup-meta\">Layer: " + escapeHtml(props.source_sheet) + "</span>");
    }
    return lines.length ? lines.join("<br/>") : "Tree";
  }

  function makePointToLayer(style) {
    return function (feature, latlng) {
      return L.circleMarker(latlng, style);
    };
  }

  function onEachFeature(popupLayer) {
    return function (feature, layer) {
      if (!feature.properties) {
        return;
      }
      layer.bindPopup(propsToPopupHtml(feature.properties));
      if (popupLayer) {
        popupLayer.push(layer);
      }
    };
  }

  function loadGeoJSON(url, done) {
    var req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.onreadystatechange = function () {
      if (req.readyState !== 4) {
        return;
      }
      if (req.status >= 200 && req.status < 300) {
        try {
          var data = JSON.parse(req.responseText);
          done(null, data);
        } catch (e) {
          done(e);
        }
      } else {
        done(new Error("HTTP " + req.status + " for " + url));
      }
    };
    req.send();
  }

  function buildLayer(geojson, style, layerRef) {
    var popupLayers = [];
    var layer = L.geoJSON(geojson, {
      pointToLayer: makePointToLayer(style),
      onEachFeature: onEachFeature(popupLayers)
    });
    layerRef.list = popupLayers;
    return layer;
  }

  var map = L.map("map").setView(KEELE_FALLBACK, ZOOM_FALLBACK);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var cherriesLayerRef = { list: [] };
  var otherLayerRef = { list: [] };
  var lostLayerRef = { list: [] };

  var cherriesLayer = null;
  var otherLayer = null;
  var lostLayer = null;

  var params = getQueryParams();
  var pendingTag = params.tag ? String(params.tag).trim() : "";
  var pendingSquare = params.square ? String(params.square).trim().toLowerCase() : "";

  function setCount(id, n) {
    var el = document.getElementById(id);
    if (el) {
      el.textContent = String(n);
    }
  }

  function wireCheckbox(id, layer) {
    var cb = document.getElementById(id);
    if (!cb || !layer) {
      return;
    }
    cb.onchange = function () {
      if (cb.checked) {
        map.addLayer(layer);
      } else {
        map.removeLayer(layer);
      }
    };
  }

  function fitToCherries() {
    if (!cherriesLayer) {
      return;
    }
    var b = cherriesLayer.getBounds();
    if (b && b.isValid()) {
      map.fitBounds(b.pad(0.08));
    }
  }

  function findAndOpenPopup(layerGroup, layerRef, matchFn) {
    if (!layerGroup || !map.hasLayer(layerGroup)) {
      return false;
    }
    var list = layerRef.list;
    for (var i = 0; i < list.length; i++) {
      var lyr = list[i];
      var f = lyr.feature;
      if (f && f.properties && matchFn(f.properties)) {
        var ll = lyr.getLatLng ? lyr.getLatLng() : null;
        if (ll) {
          map.setView(ll, Math.max(map.getZoom(), 17));
        }
        lyr.openPopup();
        return true;
      }
    }
    return false;
  }

  function applyDeepLink() {
    if (!cherriesLayer) {
      return;
    }
    var cbCherries = document.getElementById("layer-cherries");
    if (pendingTag) {
      if (cbCherries) {
        cbCherries.checked = true;
      }
      map.addLayer(cherriesLayer);
      var found = findAndOpenPopup(cherriesLayer, cherriesLayerRef, function (p) {
        return String(p.tag) === pendingTag;
      });
      if (!found && otherLayer) {
        var cbOther = document.getElementById("layer-other");
        if (cbOther) {
          cbOther.checked = true;
        }
        map.addLayer(otherLayer);
        found = findAndOpenPopup(otherLayer, otherLayerRef, function (p) {
          return String(p.tag) === pendingTag;
        });
      }
      if (!found && lostLayer) {
        var cbLost = document.getElementById("layer-lost");
        if (cbLost) {
          cbLost.checked = true;
        }
        map.addLayer(lostLayer);
        findAndOpenPopup(lostLayer, lostLayerRef, function (p) {
          return String(p.tag) === pendingTag;
        });
      }
      return;
    }
    if (pendingSquare) {
      if (cbCherries) {
        cbCherries.checked = true;
      }
      map.addLayer(cherriesLayer);
      findAndOpenPopup(cherriesLayer, cherriesLayerRef, function (p) {
        return p.square && String(p.square).toLowerCase() === pendingSquare;
      });
    }
  }

  var pending = 3;
  function checkDone() {
    pending -= 1;
    if (pending > 0) {
      return;
    }
    fitToCherries();
    applyDeepLink();
  }

  loadGeoJSON("data/cherries.geojson", function (err, data) {
    if (err) {
      setCount("count-cherries", "0");
      checkDone();
      return;
    }
    cherriesLayer = buildLayer(
      data,
      { radius: 6, fillColor: "#c41e3a", color: "#7a1020", weight: 1, opacity: 0.9, fillOpacity: 0.85 },
      cherriesLayerRef
    );
    setCount("count-cherries", data.features ? data.features.length : 0);
    map.addLayer(cherriesLayer);
    wireCheckbox("layer-cherries", cherriesLayer);
    checkDone();
  });

  loadGeoJSON("data/other_trees.geojson", function (err, data) {
    if (err) {
      setCount("count-other", "0");
      checkDone();
      return;
    }
    otherLayer = buildLayer(
      data,
      { radius: 4, fillColor: "#2d6a4f", color: "#1b4332", weight: 1, opacity: 0.75, fillOpacity: 0.65 },
      otherLayerRef
    );
    setCount("count-other", data.features ? data.features.length : 0);
    wireCheckbox("layer-other", otherLayer);
    checkDone();
  });

  loadGeoJSON("data/lost_trees.geojson", function (err, data) {
    if (err) {
      setCount("count-lost", "0");
      checkDone();
      return;
    }
    lostLayer = buildLayer(
      data,
      { radius: 5, fillColor: "#888", color: "#444", weight: 1, opacity: 0.8, fillOpacity: 0.5 },
      lostLayerRef
    );
    setCount("count-lost", data.features ? data.features.length : 0);
    wireCheckbox("layer-lost", lostLayer);
    checkDone();
  });
})();
