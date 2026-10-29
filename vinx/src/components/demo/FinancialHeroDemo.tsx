import { FinancialHero } from "@/components/ui/hero-section";

const FinancialHeroDemo = () => (
  <div className="w-full bg-background">
    <FinancialHero
      title={
        <>
          Ready to Transform Your <br />
          <span className="text-primary">Management?</span>
        </>
      }
      description="Experience the future of finance with our cutting-edge SaaS platform. Start optimizing your financial operations today!"
      buttonText="Download app"
      buttonLink="#"
      imageUrl1="https://cdn.21st.dev/assets/mirror/d7/d7533ad5cde53f489a6fbdc36cccfa46987e961526dcaaad89284f9853767c41.jpg"
      imageUrl2="https://cdn.21st.dev/assets/mirror/00/00f72bf54c03c3849745dc757b127fd8b7828ed3d17045f39da3273618a02529.jpg"
    />
  </div>
);

export default FinancialHeroDemo;
