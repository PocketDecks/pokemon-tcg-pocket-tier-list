import { createGlobalStyle } from "styled-components";

const GlobalStyle = createGlobalStyle`
    @font-face {
        font-family: "Manrope Fallback";
        src: local("Arial"), local("ArialMT");
        size-adjust: 103.1851%;
        ascent-override: 103.3095%;
        descent-override: 29.074%;
        line-gap-override: 0%;
    }

    :root {
        --bg: #1A1A17;
        --border: #000;
        --main: white;
        --s: #FF7F7F;
        --a: #FFBF7E;
        --b: #FFDF80;
        --c: #FFFF7F;
        --d: #BFFF7F;
        --f: #7FFF7F;
        --focus: #FFDF80;
        /* Bottom space reserved for the sticky ad anchor (0 when no ads). */
        --ad-anchor-h: 0px;
    }

    html {
        background-color: var(--bg);
        font-size: 10px;
    }

    body {
        padding-bottom: var(--ad-anchor-h, 0px);
        background-color: var(--bg);
    }

    @layer reset {
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: "Manrope Variable", "Manrope", "Manrope Fallback",
                system-ui, -apple-system, "Segoe UI", sans-serif;
            line-height: 1.2;
        }

        div {
            color: var(--main);
        }

        button {
            background: none;
            border: none;
        }

        input {
            border: none;
            background: none;
            -moz-appearance: textfield;
            appearance: textfield;

            // Remove arrows from number input
            &::-webkit-outer-spin-button,
            &::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
                display: none;
            }
        }

        a {
            text-decoration: none;
        }
    }

    :focus-visible {
        outline: 2px solid var(--focus);
        outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
        }
    }

`;

const GlobalStyles = (): React.JSX.Element => {
  return <GlobalStyle />;
};

export default GlobalStyles;
