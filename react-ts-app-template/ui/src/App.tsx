import React, { ReactNode, useEffect, useRef, useState } from "react";
import { isEnvBrowser } from "./utils/misc";
import { fetchNui } from "./utils/fetchNui";
import * as exports from "./utils/exports";
import "./App.css";

const resourceName = "test-app";

const { getSettings } = exports;

const App = () => {
  const appDiv = useRef(null);

  const [addedHandlers, setAddedHandlers] = useState<HTMLElement[]>([]);
  const [theme, setTheme] = useState("light");
  const [nuiData, setNuiData] = useState("");

  const nuiFocusKeepInput = (toggle: boolean) => {
    fetchNui("toggle-NuiFocusKeepInput", toggle, 'yseries', {});
  };

  const refreshInputs = (inputs: any) => {
    inputs.forEach((input: any) => {
      if (addedHandlers.includes(input)) return;

      console.log(input);
      input.addEventListener("focus", () => nuiFocusKeepInput(false));
      input.addEventListener("blur", () => nuiFocusKeepInput(true));

      setAddedHandlers((prev) => [...prev, input]);
    });
  };

  useEffect(() => {
    document.getElementsByTagName("html")[0].style.visibility = "visible";
    document.getElementsByTagName("body")[0].style.visibility = "visible";

    if (!isEnvBrowser()) {
      getSettings().then((settings) => {
        setTheme(settings.theme);
      });

      fetchNui("get-nui-data", null, resourceName).then((data: string) =>
        setNuiData(data)
      );

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              if (node.childNodes.length > 0) {
                refreshInputs(node.querySelectorAll("input, textarea"));
              }
              if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
                refreshInputs([node]);
              }
            }
          });
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });

      return () => {
        observer.disconnect();
      };
    }
  }, []);

  const [showInput, setShowInput] = useState(false);

  return (
    <AppProvider>
      <div className="app" ref={appDiv} data-theme={theme}>
        <div className="app-wrapper">
          <div className="header">
            <div className="title">Custom App Template</div>
            <div className="subtitle">React TS</div>
            <div className="subtitle">{nuiData}</div>
            {showInput && <input type="text" placeholder="Enter your name" />}
            <button onClick={() => setShowInput(!showInput)}>
              {showInput ? "Hide Input" : "Show Input"}
            </button>
          </div>
        </div>
      </div>
    </AppProvider>
  );
};

const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  if (isEnvBrowser()) {
    return <div className="browser-wrapper">{children}</div>;
  } else return children;
};

export default App;
