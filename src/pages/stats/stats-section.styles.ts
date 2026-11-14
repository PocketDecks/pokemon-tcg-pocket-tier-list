import styled from "styled-components";

export const Section = styled.section`
    display: flex;
    flex-direction: column;
    gap: 2rem;
    background: var(--surface-sunk);
    padding: 2.4rem;
    border-radius: 1.6rem;
    border: 1px solid var(--fill-hover);
    min-width: 0;
    contain: layout;

    @media (max-width: 900px) {
        padding: 1.6rem;
    }
`;

export const SectionHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;

    @media (max-width: 600px) {
        flex-direction: column;
        align-items: flex-start;
        gap: 1.2rem;
    }
`;

export const SectionTitle = styled.h2`
    font-size: 2.4rem;
    font-weight: 600;
    letter-spacing: -0.01em;
`;

export const Loading = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 40rem;
    font-size: 2rem;
    font-weight: 500;
`;
